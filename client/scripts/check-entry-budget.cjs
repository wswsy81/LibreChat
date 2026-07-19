const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST_DIR = path.resolve(__dirname, '../dist');
// Regression: PERF-001 — route-only bundles were pulled into the production entry graph.
// Found by /qa on 2026-07-19
// Report: 报告/2026-07-19-yiweilife-B5生产验收.md
const MAX_STATIC_GZIP_BYTES = Number(process.env.CLIENT_ENTRY_GZIP_BUDGET || 2_100_000);
const MAX_STATIC_FILES = Number(process.env.CLIENT_ENTRY_FILE_BUDGET || 60);

function staticImports(code) {
  const imports = [];
  const fromPattern = /\bimport(?!\s*\()[^;]*?\bfrom\s*["']([^"']+)["']/g;
  const sideEffectPattern = /\bimport\s*["']([^"']+)["']/g;
  for (const pattern of [fromPattern, sideEffectPattern]) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function relativeAsset(parent, specifier) {
  if (!specifier.startsWith('./')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(parent), specifier));
}

const htmlPath = path.join(DIST_DIR, 'index.html');
if (!fs.existsSync(htmlPath)) {
  throw new Error('client/dist/index.html is missing; run the production build first');
}

const html = fs.readFileSync(htmlPath, 'utf8');
const entry = html.match(/<script[^>]+type="module"[^>]+src="\.\/(assets\/[^"]+\.js)"/)?.[1];
if (!entry) {
  throw new Error('production entry module was not found in client/dist/index.html');
}

const styles = [
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/(assets\/[^"]+\.css)"/g),
].map((match) => match[1]);
const modulePreloads = [
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\.\/(assets\/[^"]+\.js)"/g),
].map((match) => match[1]);
const staticModules = new Set();
const pending = [entry];

while (pending.length) {
  const asset = pending.pop();
  if (!asset || staticModules.has(asset)) continue;
  staticModules.add(asset);
  const code = fs.readFileSync(path.join(DIST_DIR, asset), 'utf8');
  for (const specifier of staticImports(code)) {
    const dependency = relativeAsset(asset, specifier);
    if (dependency?.endsWith('.js')) pending.push(dependency);
  }
}

const jsAssets = fs
  .readdirSync(path.join(DIST_DIR, 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `assets/${name}`);
const importGraph = new Map(
  jsAssets.map((asset) => {
    const code = fs.readFileSync(path.join(DIST_DIR, asset), 'utf8');
    const dependencies = staticImports(code)
      .map((specifier) => relativeAsset(asset, specifier))
      .filter((dependency) => dependency?.endsWith('.js'));
    return [asset, new Set(dependencies)];
  }),
);

function findStaticPath(start, target, visited = new Set()) {
  if (start === target) return [target];
  if (visited.has(start)) return null;
  visited.add(start);
  for (const dependency of importGraph.get(start) || []) {
    const pathToTarget = findStaticPath(dependency, target, new Set(visited));
    if (pathToTarget) return [start, ...pathToTarget];
  }
  return null;
}

const assets = [...staticModules, ...styles].map((asset) => {
  const bytes = fs.readFileSync(path.join(DIST_DIR, asset));
  return { asset, raw: bytes.length, gzip: zlib.gzipSync(bytes).length };
});
const totals = assets.reduce(
  (sum, asset) => ({ raw: sum.raw + asset.raw, gzip: sum.gzip + asset.gzip }),
  { raw: 0, gzip: 0 },
);

console.log(
  `[entry-budget] ${assets.length} static files, ${(totals.raw / 1_000_000).toFixed(2)}MB raw, ${(totals.gzip / 1_000_000).toFixed(2)}MB gzip`,
);
for (const asset of assets.sort((left, right) => right.gzip - left.gzip).slice(0, 8)) {
  console.log(`[entry-budget] ${(asset.gzip / 1000).toFixed(0)}KB gzip ${asset.asset}`);
}

const failures = [];
if (!html.includes('id="loading-label"') || !html.includes('>人生设计室</span>')) {
  failures.push('production shell has no contentful branded loading state');
}
if (modulePreloads.length === 0) {
  failures.push('production entry has no modulepreload hints; high-latency ESM waterfall will regress');
}
for (const preload of modulePreloads) {
  if (/(?:mermaid|sandpack|nodebox|heic-converter|rum)\./.test(preload)) {
    failures.push(`route-only heavy chunk was modulepreloaded: ${preload}`);
  }
}
for (const sandpackAsset of jsAssets.filter((asset) => /\/sandpack\.[^/]+\.js$/.test(asset))) {
  for (const dependency of importGraph.get(sandpackAsset) || []) {
    const cycle = findStaticPath(dependency, sandpackAsset);
    if (cycle) {
      failures.push(`sandpack static import cycle: ${[sandpackAsset, ...cycle].join(' -> ')}`);
    }
  }
}
if (totals.gzip > MAX_STATIC_GZIP_BYTES) {
  failures.push(`gzip ${totals.gzip} > ${MAX_STATIC_GZIP_BYTES}`);
}
if (assets.length > MAX_STATIC_FILES) {
  failures.push(`files ${assets.length} > ${MAX_STATIC_FILES}`);
}
if (failures.length) {
  throw new Error(`client entry budget exceeded: ${failures.join(', ')}`);
}
