import type { StandardGraph } from '@librechat/agents';
import type { Agents } from 'librechat-data-provider';
import type {
  IEventTransport,
  IJobStore,
  JobStatus,
  JobStatusTransition,
  SerializableJobData,
  UsageMetadata,
} from './interfaces/IJobStore';
import type { StreamServices } from './createStreamServices';

type PartitionOptions = {
  persistent: StreamServices;
  volatile: StreamServices;
  isVolatileUser: (userId: string) => boolean;
};

class StreamPartition {
  readonly volatileStreamIds = new Set<string>();

  constructor(readonly isVolatileUser: (userId: string) => boolean) {}

  selectForCreate(streamId: string, userId: string): 'volatile' | 'persistent' {
    if (this.isVolatileUser(userId)) {
      this.volatileStreamIds.add(streamId);
      return 'volatile';
    }
    this.volatileStreamIds.delete(streamId);
    return 'persistent';
  }

  select(streamId: string): 'volatile' | 'persistent' {
    return this.volatileStreamIds.has(streamId) ? 'volatile' : 'persistent';
  }
}

class PartitionedJobStore implements IJobStore {
  constructor(
    private readonly persistent: IJobStore,
    private readonly volatile: IJobStore,
    private readonly partition: StreamPartition,
  ) {}

  private store(streamId: string): IJobStore {
    return this.partition.select(streamId) === 'volatile' ? this.volatile : this.persistent;
  }

  async initialize(): Promise<void> {
    await Promise.all([this.persistent.initialize(), this.volatile.initialize()]);
  }

  async createJob(
    streamId: string,
    userId: string,
    conversationId?: string,
    tenantId?: string,
  ): Promise<SerializableJobData> {
    const target =
      this.partition.selectForCreate(streamId, userId) === 'volatile'
        ? this.volatile
        : this.persistent;
    return target.createJob(streamId, userId, conversationId, tenantId);
  }

  async getJob(streamId: string): Promise<SerializableJobData | null> {
    if (this.partition.volatileStreamIds.has(streamId)) return this.volatile.getJob(streamId);
    const volatileJob = await this.volatile.getJob(streamId);
    if (volatileJob) {
      this.partition.volatileStreamIds.add(streamId);
      return volatileJob;
    }
    return this.persistent.getJob(streamId);
  }

  updateJob(streamId: string, updates: Partial<SerializableJobData>): Promise<void> {
    return this.store(streamId).updateJob(streamId, updates);
  }

  transitionStatus(streamId: string, args: JobStatusTransition): Promise<boolean> {
    return this.store(streamId).transitionStatus(streamId, args);
  }

  async deleteJob(streamId: string): Promise<void> {
    await this.store(streamId).deleteJob(streamId);
    this.partition.volatileStreamIds.delete(streamId);
  }

  async hasJob(streamId: string): Promise<boolean> {
    if (this.partition.volatileStreamIds.has(streamId)) return this.volatile.hasJob(streamId);
    return (await this.volatile.hasJob(streamId)) || this.persistent.hasJob(streamId);
  }

  async getRunningJobs(): Promise<SerializableJobData[]> {
    const [persistent, volatile] = await Promise.all([
      this.persistent.getRunningJobs(),
      this.volatile.getRunningJobs(),
    ]);
    return [...persistent, ...volatile];
  }

  async cleanup(): Promise<number> {
    const [persistentCount, volatileCount] = await Promise.all([
      this.persistent.cleanup(),
      this.volatile.cleanup(),
    ]);
    for (const streamId of [...this.partition.volatileStreamIds]) {
      if (!(await this.volatile.hasJob(streamId))) {
        this.partition.volatileStreamIds.delete(streamId);
      }
    }
    return persistentCount + volatileCount;
  }

  recordActivity(streamId: string): void {
    this.store(streamId).recordActivity?.(streamId);
  }

  async getJobCount(): Promise<number> {
    const [persistent, volatile] = await Promise.all([
      this.persistent.getJobCount(),
      this.volatile.getJobCount(),
    ]);
    return persistent + volatile;
  }

  async getJobCountByStatus(status: JobStatus): Promise<number> {
    const [persistent, volatile] = await Promise.all([
      this.persistent.getJobCountByStatus(status),
      this.volatile.getJobCountByStatus(status),
    ]);
    return persistent + volatile;
  }

  async destroy(): Promise<void> {
    await Promise.all([this.persistent.destroy(), this.volatile.destroy()]);
    this.partition.volatileStreamIds.clear();
  }

  async getActiveJobIdsByUser(userId: string, tenantId?: string): Promise<string[]> {
    if (this.partition.isVolatileUser(userId)) {
      return this.volatile.getActiveJobIdsByUser(userId, tenantId);
    }
    return this.persistent.getActiveJobIdsByUser(userId, tenantId);
  }

  setGraph(streamId: string, graph: StandardGraph): void {
    this.store(streamId).setGraph(streamId, graph);
  }

  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void {
    this.store(streamId).setContentParts(streamId, contentParts);
  }

  getContentParts(streamId: string) {
    return this.store(streamId).getContentParts(streamId);
  }

  getRunSteps(streamId: string): Promise<Agents.RunStep[]> {
    return this.store(streamId).getRunSteps(streamId);
  }

  appendChunk(streamId: string, event: unknown): Promise<void> {
    return this.store(streamId).appendChunk(streamId, event);
  }

  clearContentState(streamId: string): void {
    this.store(streamId).clearContentState(streamId);
  }

  saveRunSteps(streamId: string, runSteps: Agents.RunStep[]): Promise<void> {
    return this.store(streamId).saveRunSteps?.(streamId, runSteps) ?? Promise.resolve();
  }

  setCollectedUsage(streamId: string, collectedUsage: UsageMetadata[]): void {
    this.store(streamId).setCollectedUsage(streamId, collectedUsage);
  }

  getCollectedUsage(streamId: string): UsageMetadata[] {
    return this.store(streamId).getCollectedUsage(streamId);
  }
}

class PartitionedEventTransport implements IEventTransport {
  constructor(
    private readonly persistent: IEventTransport,
    private readonly volatile: IEventTransport,
    private readonly partition: StreamPartition,
  ) {}

  private transport(streamId: string): IEventTransport {
    return this.partition.select(streamId) === 'volatile' ? this.volatile : this.persistent;
  }

  subscribe(streamId: string, handlers: Parameters<IEventTransport['subscribe']>[1]) {
    return this.transport(streamId).subscribe(streamId, handlers);
  }

  emitChunk(streamId: string, event: unknown) {
    return this.transport(streamId).emitChunk(streamId, event);
  }

  emitDone(streamId: string, event: unknown) {
    return this.transport(streamId).emitDone(streamId, event);
  }

  emitError(streamId: string, error: string) {
    return this.transport(streamId).emitError(streamId, error);
  }

  emitAbort(streamId: string): void {
    this.transport(streamId).emitAbort?.(streamId);
  }

  onAbort(streamId: string, callback: () => void): void {
    this.transport(streamId).onAbort?.(streamId, callback);
  }

  getSubscriberCount(streamId: string): number {
    return this.transport(streamId).getSubscriberCount(streamId);
  }

  isFirstSubscriber(streamId: string): boolean {
    return this.transport(streamId).isFirstSubscriber(streamId);
  }

  onAllSubscribersLeft(streamId: string, callback: () => void): void {
    this.transport(streamId).onAllSubscribersLeft(streamId, callback);
  }

  syncReorderBuffer(streamId: string, earlyReplayCount?: number) {
    return this.transport(streamId).syncReorderBuffer?.(streamId, earlyReplayCount);
  }

  cleanup(streamId: string): void {
    this.transport(streamId).cleanup(streamId);
  }

  getTrackedStreamIds(): string[] {
    return [
      ...new Set([
        ...this.persistent.getTrackedStreamIds(),
        ...this.volatile.getTrackedStreamIds(),
      ]),
    ];
  }

  destroy(): void {
    this.persistent.destroy();
    this.volatile.destroy();
  }
}

export function createPartitionedStreamServices({
  persistent,
  volatile,
  isVolatileUser,
}: PartitionOptions): StreamServices {
  const partition = new StreamPartition(isVolatileUser);
  return {
    jobStore: new PartitionedJobStore(persistent.jobStore, volatile.jobStore, partition),
    eventTransport: new PartitionedEventTransport(
      persistent.eventTransport,
      volatile.eventTransport,
      partition,
    ),
    isRedis: persistent.isRedis,
  };
}
