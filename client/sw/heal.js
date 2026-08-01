/* Runs inside the generated service worker via workbox `importScripts`.
 * A page can keep executing an old, fully responsive SPA after production
 * switches to a new build. A generic ping therefore cannot prove that the
 * page is current. Ping every window client with this worker's build ID and
 * navigate clients that are silent, predate the ID protocol, or report a
 * different build. */
const PING_TYPE = 'LC_SW_PING';
const PONG_TYPE = 'LC_SW_PONG';
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
    resolvePong(typeof event.data.buildId === 'string' ? event.data.buildId : null);
  }
});

function pingClient(client) {
  return new Promise((resolve) => {
    pendingPongs.set(client.id, resolve);
    setTimeout(() => {
      if (pendingPongs.delete(client.id)) {
        resolve(null);
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
      const clientBuildId = await pingClient(client);
      if (clientBuildId === ACTIVE_BUILD_ID) {
        return;
      }
      try {
        await client.navigate(client.url);
      } catch {
        /* client closed or no longer controllable */
      }
    }),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(reloadStaleClients());
});
