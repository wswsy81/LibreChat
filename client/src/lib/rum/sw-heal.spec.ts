import fs from 'fs';
import path from 'path';
import vm from 'vm';

type ClientReply = 'matching' | 'mismatched' | 'legacy' | 'silent';

type WorkerEvent = {
  data?: { type?: string; buildId?: string };
  source?: WorkerClient;
  waitUntil?: (promise: Promise<void>) => void;
};

type WorkerClient = {
  id: string;
  url: string;
  frameType: string;
  visibilityState: 'hidden' | 'visible';
  navigate: jest.Mock<Promise<void>, [string]>;
  postMessage: (message: { type?: string; buildId?: string }) => void;
};

function workerHarness(reply: ClientReply) {
  const source = fs
    .readFileSync(path.resolve(__dirname, '../../../sw/heal.js'), 'utf8')
    .replaceAll('__LC_BUILD_ID_VALUE__', 'build-current');
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const timers: Array<() => void> = [];
  const workerMessages: Array<{ type?: string; buildId?: string }> = [];
  const client = {
    id: 'client-1',
    url: 'https://yiweilife.com/home',
    frameType: 'top-level',
    visibilityState: 'visible',
    navigate: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
    postMessage: (message: { type?: string; buildId?: string }) => {
      workerMessages.push(message);
      if (message.type !== 'LC_SW_PING' || reply === 'silent') return;
      let buildId: string | undefined;
      if (reply === 'matching') {
        buildId = 'build-current';
      } else if (reply === 'mismatched') {
        buildId = 'build-previous';
      }
      handlers.get('message')?.({
        data: { type: 'LC_SW_PONG', ...(buildId ? { buildId } : {}) },
        source: client,
      });
    },
  } satisfies WorkerClient;
  const worker = {
    addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
      handlers.set(type, handler);
    },
    clients: {
      claim: jest.fn(() => Promise.resolve()),
      matchAll: jest.fn(() => Promise.resolve([client])),
    },
  };

  vm.runInNewContext(source, {
    self: worker,
    Map,
    Promise,
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return timers.length;
    },
  });

  return {
    client,
    workerMessages,
    activate: async () => {
      let activation: Promise<void> | undefined;
      handlers.get('activate')?.({ waitUntil: (promise) => (activation = promise) });
      if (reply === 'silent') {
        for (let attempt = 0; attempt < 20 && timers.length === 0; attempt += 1) {
          await Promise.resolve();
        }
        timers.forEach((callback) => callback());
      }
      await activation;
    },
  };
}

describe('service-worker build identity healing', () => {
  it('makes each page report its build and check for a newer worker while it stays open', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../../index.html'), 'utf8');

    expect(indexHtml).toContain("window.__LC_BUILD_ID__ = '__LC_BUILD_ID_VALUE__'");
    expect(indexHtml).toContain('buildId: window.__LC_BUILD_ID__');
    expect(indexHtml).toContain("event.data.type === 'LC_SW_RELOAD_REQUIRED'");
    expect(indexHtml).toContain(
      'document.querySelector(\'[data-testid="stop-generation-button"]\')',
    );
    expect(indexHtml).toContain('window.location.reload()');
    expect(indexHtml).toContain('return registration.update()');
    expect(indexHtml).toContain('.catch(function ()');
  });

  it('keeps a responsive client that already runs the active build', async () => {
    const harness = workerHarness('matching');

    await harness.activate();

    expect(harness.client.navigate).not.toHaveBeenCalled();
    expect(harness.workerMessages).not.toContainEqual(
      expect.objectContaining({ type: 'LC_SW_RELOAD_REQUIRED' }),
    );
  });

  it.each(['legacy', 'mismatched'] as const)(
    'asks a responsive %s page to reload itself without forcing a stale client URL',
    async (reply) => {
      const harness = workerHarness(reply);

      await harness.activate();

      expect(harness.client.navigate).not.toHaveBeenCalled();
      expect(harness.workerMessages).toContainEqual({
        type: 'LC_SW_RELOAD_REQUIRED',
        buildId: 'build-current',
      });
    },
  );

  it('does not force-navigate a silent visible page that may contain unsent work', async () => {
    const harness = workerHarness('silent');

    await harness.activate();

    expect(harness.client.navigate).not.toHaveBeenCalled();
  });
});
