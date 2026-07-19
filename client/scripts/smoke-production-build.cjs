const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const DIST_DIR = path.resolve(__dirname, '../dist');
const INDEX_PATH = path.join(DIST_DIR, 'index.html');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(INDEX_PATH)) {
  throw new Error('client/dist/index.html is missing; run the production build first');
}

function sendFile(res, filePath) {
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/') || pathname.startsWith('/oauth/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"error":"offline production-build smoke"}');
    return;
  }

  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = path.resolve(DIST_DIR, relativePath || 'index.html');
  if (candidate.startsWith(`${DIST_DIR}${path.sep}`) && fs.existsSync(candidate)) {
    sendFile(res, candidate);
    return;
  }
  sendFile(res, INDEX_PATH);
});

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));

  try {
    await page.goto(`http://127.0.0.1:${address.port}/`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.waitForTimeout(1_500);
    const state = await page.evaluate(() => ({
      title: document.title,
      rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
    }));
    if (pageErrors.length) {
      throw new Error(
        `production build raised a browser page error:\n${pageErrors.join('\n---\n')}`,
      );
    }
    if (state.title !== '人生设计室' || state.rootChildren < 1) {
      throw new Error(`production build did not mount: ${JSON.stringify(state)}`);
    }
    console.log(
      `[production-build-smoke] mounted title=${JSON.stringify(state.title)} rootChildren=${state.rootChildren}`,
    );
  } finally {
    await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
