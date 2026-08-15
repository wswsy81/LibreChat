/* Runs inside the generated service worker via workbox `importScripts`.
 * A page can keep executing an old, fully responsive SPA after production
 * switches to a new build. A generic ping therefore cannot prove that the
 * page is current. Ping every window client with this worker's build ID and
 * ask responsive stale pages to reload themselves at a safe time. The worker
 * must never navigate a window client directly: after an SPA route change,
 * WindowClient.url can still point at the previous network URL. */
const PING_TYPE = 'LC_SW_PING';
const PONG_TYPE = 'LC_SW_PONG';
const RELOAD_TYPE = 'LC_SW_RELOAD_REQUIRED';
const PONG_TIMEOUT_MS = 1500;
const ACTIVE_BUILD_ID = '__LC_BUILD_ID_VALUE__';

const pendingPongs = new Map();

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== PONG_TYPE || !event.source) {
    return;
  }
  const resolvePong = pendingPongs.get(event.source.id);
  if (resolvePong) {
    pendingPongs.delete(event.source.id);
    resolvePong({
      buildId: typeof event.data.buildId === 'string' ? event.data.buildId : null,
      responded: true,
    });
  }
});

function pingClient(client) {
  return new Promise((resolve) => {
    pendingPongs.set(client.id, resolve);
    setTimeout(() => {
      if (pendingPongs.delete(client.id)) {
        resolve({ buildId: null, responded: false });
      }
    }, PONG_TIMEOUT_MS);
    client.postMessage({ type: PING_TYPE, buildId: ACTIVE_BUILD_ID });
  });
}

async function reloadStaleClients() {
  await self.clients.claim();
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  const topLevelClients = windowClients.filter((client) => client.frameType !== 'nested');
  await Promise.all(
    topLevelClients.map(async (client) => {
      const { buildId: clientBuildId, responded } = await pingClient(client);
      if (clientBuildId === ACTIVE_BUILD_ID) {
        return;
      }
      if (!responded) {
        return;
      }
      client.postMessage({ type: RELOAD_TYPE, buildId: ACTIVE_BUILD_ID });
    }),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(reloadStaleClients());
});
