const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const zlib = require('zlib');

const BUILD_ID_PLACEHOLDER = '__LC_BUILD_ID_VALUE__';
const DIST_DIR = path.resolve(__dirname, '../dist');

async function fingerprintFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await fingerprintFiles(absolutePath, relativePath)));
      continue;
    }
    if (/\.(?:br|gz|map)$/u.test(entry.name)) continue;
    files.push(relativePath);
  }

  return files;
}

async function clientBuildId() {
  const hash = crypto.createHash('sha256');
  const files = (await fingerprintFiles(DIST_DIR)).sort();

  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(await fs.readFile(path.join(DIST_DIR, relativePath)));
    hash.update('\0');
  }

  return hash.digest('hex').slice(0, 16);
}

async function refreshCompressedCopies(filePath, content) {
  if (await fs.pathExists(`${filePath}.gz`)) {
    await fs.writeFile(`${filePath}.gz`, zlib.gzipSync(content));
  }
  if (await fs.pathExists(`${filePath}.br`)) {
    await fs.writeFile(`${filePath}.br`, zlib.brotliCompressSync(content));
  }
}

async function stampBuildId(fileName, buildId) {
  const filePath = path.join(DIST_DIR, fileName);
  const source = await fs.readFile(filePath, 'utf8');
  if (!source.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(`${fileName} is missing the client build ID placeholder`);
  }
  const stamped = source.replaceAll(BUILD_ID_PLACEHOLDER, buildId);
  await fs.writeFile(filePath, stamped);
  await refreshCompressedCopies(filePath, stamped);
}

async function postBuild() {
  try {
    await fs.copy('public/assets', 'dist/assets');
    await fs.copy('public/robots.txt', 'dist/robots.txt');
    const buildId = await clientBuildId();
    await Promise.all([stampBuildId('index.html', buildId), stampBuildId('sw-heal.js', buildId)]);
    console.log(`✅ Client build identity stamped: ${buildId}`);
    console.log('✅ PWA icons and robots.txt copied successfully. Glob pattern warnings resolved.');
  } catch (err) {
    console.error('❌ Error copying files:', err);
    process.exit(1);
  }
}

postBuild();
