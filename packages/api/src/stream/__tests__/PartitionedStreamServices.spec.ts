import type { ServerSentEvent } from '~/types';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';
import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { createPartitionedStreamServices } from '~/stream/PartitionedStreamServices';

jest.spyOn(console, 'log').mockImplementation();

function createFixture(localUsers = new Set(['local-user'])) {
  const persistent = {
    jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
    eventTransport: new InMemoryEventTransport(),
    isRedis: true,
  };
  const volatile = {
    jobStore: new InMemoryJobStore({ ttlAfterComplete: 60_000 }),
    eventTransport: new InMemoryEventTransport(),
    isRedis: false,
  };
  const services = createPartitionedStreamServices({
    persistent,
    volatile,
    isVolatileUser: (userId) => localUsers.has(userId),
  });
  return { persistent, volatile, services };
}

describe('createPartitionedStreamServices', () => {
  test('keeps local-user jobs and events out of the persistent services', async () => {
    const { persistent, volatile, services } = createFixture();
    const persistentCreate = jest.spyOn(persistent.jobStore, 'createJob');
    const persistentEmit = jest.spyOn(persistent.eventTransport, 'emitChunk');
    const volatileEmit = jest.spyOn(volatile.eventTransport, 'emitChunk');

    await services.jobStore.createJob('local-stream', 'local-user', 'local-stream');
    const received: unknown[] = [];
    services.eventTransport.subscribe('local-stream', {
      onChunk: (event) => received.push(event),
    });
    await services.eventTransport.emitChunk('local-stream', { text: 'local only' });

    expect(persistentCreate).not.toHaveBeenCalled();
    expect(await persistent.jobStore.hasJob('local-stream')).toBe(false);
    expect(await volatile.jobStore.hasJob('local-stream')).toBe(true);
    expect(persistentEmit).not.toHaveBeenCalled();
    expect(volatileEmit).toHaveBeenCalledWith('local-stream', { text: 'local only' });
    expect(received).toEqual([{ text: 'local only' }]);

    await services.jobStore.destroy();
    services.eventTransport.destroy();
  });

  test('keeps normal-user jobs and events on the persistent services', async () => {
    const { persistent, volatile, services } = createFixture();
    const volatileCreate = jest.spyOn(volatile.jobStore, 'createJob');
    const persistentEmit = jest.spyOn(persistent.eventTransport, 'emitChunk');
    const volatileEmit = jest.spyOn(volatile.eventTransport, 'emitChunk');

    await services.jobStore.createJob('normal-stream', 'normal-user', 'normal-stream');
    const received: unknown[] = [];
    services.eventTransport.subscribe('normal-stream', {
      onChunk: (event) => received.push(event),
    });
    await services.eventTransport.emitChunk('normal-stream', { text: 'persistent' });

    expect(volatileCreate).not.toHaveBeenCalled();
    expect(await volatile.jobStore.hasJob('normal-stream')).toBe(false);
    expect(await persistent.jobStore.hasJob('normal-stream')).toBe(true);
    expect(volatileEmit).not.toHaveBeenCalled();
    expect(persistentEmit).toHaveBeenCalledWith('normal-stream', { text: 'persistent' });
    expect(received).toEqual([{ text: 'persistent' }]);

    await services.jobStore.destroy();
    services.eventTransport.destroy();
  });

  test('retains a completed local final event for a late subscriber', async () => {
    const { persistent, volatile, services } = createFixture();
    const manager = new GenerationJobManagerClass();
    manager.configure({ ...services, cleanupOnComplete: false });
    manager.initialize();

    const finalEvent = {
      final: true,
      conversation: { conversationId: 'retained-stream' },
    } as ServerSentEvent;
    await manager.createJob('retained-stream', 'local-user', 'retained-stream');
    await manager.emitDone('retained-stream', finalEvent);
    await manager.completeJob('retained-stream');

    expect(await persistent.jobStore.hasJob('retained-stream')).toBe(false);
    expect(await volatile.jobStore.hasJob('retained-stream')).toBe(true);
    await expect(manager.getJobStatus('retained-stream')).resolves.toBe('complete');

    const replayed = await new Promise<ServerSentEvent | undefined>((resolve) => {
      void manager
        .subscribe('retained-stream', () => undefined, resolve)
        .then((subscription) => {
          if (!subscription) resolve(undefined);
        });
    });
    expect(replayed).toEqual(finalEvent);

    await manager.destroy();
  });

  test('routes cleanup and deletion to the owning stores', async () => {
    const { persistent, volatile, services } = createFixture();
    await services.jobStore.createJob('local-delete', 'local-user', 'local-delete');
    await services.jobStore.createJob('normal-delete', 'normal-user', 'normal-delete');

    await services.jobStore.deleteJob('local-delete');
    expect(await volatile.jobStore.hasJob('local-delete')).toBe(false);
    expect(await persistent.jobStore.hasJob('normal-delete')).toBe(true);

    await services.jobStore.deleteJob('normal-delete');
    expect(await persistent.jobStore.hasJob('normal-delete')).toBe(false);

    await services.jobStore.createJob('local-expired', 'local-user', 'local-expired');
    await services.jobStore.updateJob('local-expired', {
      status: 'complete',
      completedAt: Date.now() - 120_000,
    });
    await services.jobStore.cleanup();
    expect(await volatile.jobStore.hasJob('local-expired')).toBe(false);

    await services.jobStore.destroy();
    services.eventTransport.destroy();
  });
});
