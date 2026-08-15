import { dataService } from 'librechat-data-provider';
import { setLocalDataSessionHeader } from 'librechat-data-provider';
import type {
  LifeBootstrapResponse,
  LifeEngineSnapshot,
  LifeLocalConversationSummary,
  TConversation,
  TMessage,
} from 'librechat-data-provider';

const DB_NAME = 'future-lines-device-data';
const DB_VERSION = 2;
const LEGACY_LOCAL_NEW_CHAT_TITLE = String.fromCodePoint(0x65b0, 0x5bf9, 0x8bdd);
const META_STORE = 'meta';
const CONVERSATION_STORE = 'conversations';
const MESSAGE_STORE = 'messages';
const SNAPSHOT_STORE = 'engineSnapshots';

type DeviceRuntime = {
  mode: 'server' | 'device' | 'unknown';
  userId: string | null;
  notice: string | null;
  dataGeneration: number;
};

type StoredUserMeta = {
  userId: string;
  generation: number;
  tombstones: Record<string, number>;
};

type StoredConversation = {
  key: string;
  userId: string;
  conversationId: string;
  value: TConversation;
  updatedAt: string;
};

type StoredMessage = {
  key: string;
  userId: string;
  conversationId: string;
  messageId: string;
  position?: number;
  createdAt: string;
  sequence: number;
  value: TMessage;
};

type StoredSnapshot = {
  userId: string;
  snapshot: LifeEngineSnapshot;
  updatedAt: string;
};

let runtime: DeviceRuntime = {
  mode: 'unknown',
  userId: null,
  notice: null,
  dataGeneration: 0,
};
let databasePromise: Promise<IDBDatabase> | null = null;
let preparePromise: { generation: number; promise: Promise<LifeBootstrapResponse> } | null = null;
let snapshotWriteState: {
  authGeneration: number;
  userId: string;
  dataGeneration: number;
  requested: boolean;
  promise: Promise<void>;
} | null = null;
let localSessionPrepared = false;
let localSessionId: string | null = null;
let authGeneration = 0;

const localDataChannel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('future-lines-device-data-v1')
    : null;

function staleWriteError() {
  return Object.assign(new Error('Device-local data changed in another tab; reload to continue'), {
    code: 'LOCAL_DATA_STALE_WRITE',
  });
}

function notifyLocalDataFailure(error: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('futureLinesLocalDataWriteFailed', {
      detail: { message: error instanceof Error ? error.message : String(error) },
    }),
  );
}

export function resetDeviceDataRuntime(): void {
  authGeneration += 1;
  runtime = { mode: 'unknown', userId: null, notice: null, dataGeneration: 0 };
  preparePromise = null;
  snapshotWriteState = null;
  localSessionPrepared = false;
  localSessionId = null;
  setLocalDataSessionHeader(undefined);
}

if (typeof window !== 'undefined') {
  window.addEventListener('futureLinesLifeMutationCompleted', () => {
    if (!isDeviceDataMode() || !localSessionPrepared) return;
    void persistDeviceEngineSnapshot().catch((error) => {
      console.error('[local-data] failed to persist life mutation snapshot', error);
      notifyLocalDataFailure(error);
    });
  });
}

localDataChannel?.addEventListener('message', (event) => {
  const message = event.data as { type?: string; userId?: string; generation?: number };
  if (
    message?.type !== 'cleared' ||
    message.userId !== runtime.userId ||
    !Number.isSafeInteger(message.generation) ||
    Number(message.generation) <= runtime.dataGeneration
  ) {
    return;
  }
  authGeneration += 1;
  runtime = { ...runtime, dataGeneration: Number(message.generation) };
  preparePromise = null;
  snapshotWriteState = null;
  localSessionPrepared = false;
  localSessionId = null;
  setLocalDataSessionHeader(undefined);
});

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
        const store = db.createObjectStore(CONVERSATION_STORE, { keyPath: 'key' });
        store.createIndex('byUserUpdatedAt', ['userId', 'updatedAt']);
      }
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) {
        const store = db.createObjectStore(MESSAGE_STORE, { keyPath: 'key' });
        store.createIndex('byUserConversation', ['userId', 'conversationId']);
        store.createIndex('byUserCreatedAt', ['userId', 'createdAt', 'sequence']);
      } else {
        const store = request.transaction?.objectStore(MESSAGE_STORE);
        if (store && !store.indexNames.contains('byUserCreatedAt')) {
          store.createIndex('byUserCreatedAt', ['userId', 'createdAt', 'sequence']);
        }
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open device data store'));
    request.onblocked = () => reject(new Error('Device data store is blocked by another tab'));
  });
  return databasePromise;
}

function conversationKey(userId: string, conversationId: string) {
  return `${userId}\u0000${conversationId}`;
}

function messageKey(userId: string, conversationId: string, messageId: string) {
  return `${userId}\u0000${conversationId}\u0000${messageId}`;
}

function currentUserId(): string | null {
  return runtime.mode === 'device' ? runtime.userId : null;
}

async function loadUserMeta(userId: string): Promise<StoredUserMeta> {
  const db = await openDatabase();
  const transaction = db.transaction(META_STORE, 'readonly');
  const row = await requestResult<StoredUserMeta | undefined>(
    transaction.objectStore(META_STORE).get(userId),
  );
  await transactionDone(transaction);
  return row ?? { userId, generation: 0, tombstones: {} };
}

function assertRuntimeContext(userId: string, generation: number, auth: number) {
  if (
    auth !== authGeneration ||
    runtime.mode !== 'device' ||
    runtime.userId !== userId ||
    runtime.dataGeneration !== generation
  ) {
    throw staleWriteError();
  }
}

export function getDeviceDataRuntime(): DeviceRuntime {
  return runtime;
}

export function isDeviceDataMode(): boolean {
  return runtime.mode === 'device' && Boolean(runtime.userId);
}

async function requestPersistentStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is a best-effort browser hint; IndexedDB remains authoritative.
  }
}

async function loadEngineSnapshot(userId: string): Promise<LifeEngineSnapshot | null> {
  const db = await openDatabase();
  const transaction = db.transaction(SNAPSHOT_STORE, 'readonly');
  const row = await requestResult<StoredSnapshot | undefined>(
    transaction.objectStore(SNAPSHOT_STORE).get(userId),
  );
  await transactionDone(transaction);
  return row?.snapshot ?? null;
}

async function saveEngineSnapshot(
  userId: string,
  snapshot: LifeEngineSnapshot,
  generation: number,
  auth: number,
): Promise<void> {
  assertRuntimeContext(userId, generation, auth);
  const db = await openDatabase();
  const transaction = db.transaction([META_STORE, SNAPSHOT_STORE], 'readwrite');
  const meta = (await requestResult<StoredUserMeta | undefined>(
    transaction.objectStore(META_STORE).get(userId),
  )) ?? { userId, generation: 0, tombstones: {} };
  if (meta.generation !== generation) {
    transaction.abort();
    throw staleWriteError();
  }
  transaction.objectStore(SNAPSHOT_STORE).put({
    userId,
    snapshot,
    updatedAt: new Date().toISOString(),
  } satisfies StoredSnapshot);
  await transactionDone(transaction);
}

async function allStoredMessages(userId: string): Promise<TMessage[]> {
  const db = await openDatabase();
  const transaction = db.transaction(MESSAGE_STORE, 'readonly');
  const rows = (
    await requestResult<StoredMessage[]>(transaction.objectStore(MESSAGE_STORE).getAll())
  )
    .filter((row) => row.userId === userId)
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || String(left.value.createdAt || '')) || 0;
      const rightTime = Date.parse(right.createdAt || String(right.value.createdAt || '')) || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return (left.sequence ?? left.position ?? 0) - (right.sequence ?? right.position ?? 0);
    });
  await transactionDone(transaction);
  return rows.slice(-2000).map((row) => row.value);
}

export async function getDeviceConversation(conversationId: string): Promise<TConversation> {
  const userId = currentUserId();
  if (!userId) throw new Error('Device-local data mode is not ready');
  const db = await openDatabase();
  const transaction = db.transaction(CONVERSATION_STORE, 'readonly');
  const row = await requestResult<StoredConversation | undefined>(
    transaction.objectStore(CONVERSATION_STORE).get(conversationKey(userId, conversationId)),
  );
  await transactionDone(transaction);
  if (!row) throw Object.assign(new Error('Device-local conversation not found'), { status: 404 });
  return row.value;
}

export async function getDeviceMessages(conversationId: string): Promise<TMessage[]> {
  const userId = currentUserId();
  if (!userId) throw new Error('Device-local data mode is not ready');
  const db = await openDatabase();
  const transaction = db.transaction(MESSAGE_STORE, 'readonly');
  const index = transaction.objectStore(MESSAGE_STORE).index('byUserConversation');
  const rows = await requestResult<StoredMessage[]>(
    index.getAll(IDBKeyRange.only([userId, conversationId])),
  );
  await transactionDone(transaction);
  return rows
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      return String(left.value.createdAt || '').localeCompare(String(right.value.createdAt || ''));
    })
    .map((row) => row.value);
}

export async function listDeviceConversations(): Promise<TConversation[]> {
  const userId = currentUserId();
  if (!userId) return [];
  const db = await openDatabase();
  const transaction = db.transaction(CONVERSATION_STORE, 'readonly');
  const rows = (
    await requestResult<StoredConversation[]>(transaction.objectStore(CONVERSATION_STORE).getAll())
  ).filter((row) => row.userId === userId);
  await transactionDone(transaction);
  return rows
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((row) => row.value);
}

export async function listDeviceConversationSummaries(): Promise<LifeLocalConversationSummary[]> {
  const conversations = await listDeviceConversations();
  return conversations.slice(0, 200).flatMap((conversation) => {
    if (!conversation.conversationId) return [];
    return [
      {
        conversationId: conversation.conversationId,
        title: typeof conversation.title === 'string' ? conversation.title : null,
        updatedAt: typeof conversation.updatedAt === 'string' ? conversation.updatedAt : null,
      },
    ];
  });
}

export async function updateDeviceConversation(
  conversationId: string,
  patch: Partial<TConversation>,
): Promise<TConversation> {
  const userId = currentUserId();
  const generation = runtime.dataGeneration;
  const auth = authGeneration;
  if (!userId) throw new Error('Device-local data mode is not ready');
  const current = await getDeviceConversation(conversationId);
  const now = new Date().toISOString();
  const value = { ...current, ...patch, conversationId, updatedAt: now } as TConversation;
  const db = await openDatabase();
  assertRuntimeContext(userId, generation, auth);
  const transaction = db.transaction([META_STORE, CONVERSATION_STORE], 'readwrite');
  const meta = (await requestResult<StoredUserMeta | undefined>(
    transaction.objectStore(META_STORE).get(userId),
  )) ?? { userId, generation: 0, tombstones: {} };
  if (meta.generation !== generation || meta.tombstones[conversationId] != null) {
    transaction.abort();
    throw staleWriteError();
  }
  transaction.objectStore(CONVERSATION_STORE).put({
    key: conversationKey(userId, conversationId),
    userId,
    conversationId,
    value,
    updatedAt: now,
  } satisfies StoredConversation);
  await transactionDone(transaction);
  return value;
}

function localTitle(conversation: TConversation, messages: TMessage[]): string {
  const current = String(conversation.title || '').trim();
  if (current && current !== 'New Chat' && current !== LEGACY_LOCAL_NEW_CHAT_TITLE) return current;
  const firstUserText = messages.find((message) => message.isCreatedByUser)?.text;
  if (typeof firstUserText !== 'string' || !firstUserText.trim()) return 'New Chat';
  return (
    firstUserText
      .replace(/^\[trigger:[^\]]+\]\s*/, '')
      .trim()
      .slice(0, 18) || 'New Chat'
  );
}

export async function saveDeviceConversationTurn(
  conversation: TConversation,
  messages: TMessage[],
): Promise<void> {
  const userId = currentUserId();
  const generation = runtime.dataGeneration;
  const auth = authGeneration;
  const conversationId = conversation?.conversationId;
  if (!userId || !conversationId || !Array.isArray(messages) || messages.length === 0) return;
  const db = await openDatabase();
  assertRuntimeContext(userId, generation, auth);
  const transaction = db.transaction([META_STORE, CONVERSATION_STORE, MESSAGE_STORE], 'readwrite');
  const meta = (await requestResult<StoredUserMeta | undefined>(
    transaction.objectStore(META_STORE).get(userId),
  )) ?? { userId, generation: 0, tombstones: {} };
  if (meta.generation !== generation || meta.tombstones[conversationId] != null) {
    transaction.abort();
    throw staleWriteError();
  }
  const messageStore = transaction.objectStore(MESSAGE_STORE);
  const index = messageStore.index('byUserConversation');
  const keys = await requestResult<IDBValidKey[]>(
    index.getAllKeys(IDBKeyRange.only([userId, conversationId])),
  );
  keys.forEach((key) => messageStore.delete(key));
  messages.forEach((message, position) => {
    if (!message?.messageId) return;
    messageStore.put({
      key: messageKey(userId, conversationId, message.messageId),
      userId,
      conversationId,
      messageId: message.messageId,
      position,
      createdAt:
        typeof message.createdAt === 'string' && message.createdAt
          ? message.createdAt
          : new Date(0).toISOString(),
      sequence: position,
      value: message,
    } satisfies StoredMessage);
  });
  const now = new Date().toISOString();
  const value = {
    ...conversation,
    title: localTitle(conversation, messages),
    createdAt: conversation.createdAt || now,
    updatedAt: now,
    user: userId,
  } as TConversation;
  transaction.objectStore(CONVERSATION_STORE).put({
    key: conversationKey(userId, conversationId),
    userId,
    conversationId,
    value,
    updatedAt: now,
  } satisfies StoredConversation);
  await transactionDone(transaction);
}

export async function deleteDeviceConversation(conversationId: string): Promise<boolean> {
  const userId = currentUserId();
  const generation = runtime.dataGeneration;
  const auth = authGeneration;
  if (!userId) return false;
  const db = await openDatabase();
  assertRuntimeContext(userId, generation, auth);
  const transaction = db.transaction([META_STORE, CONVERSATION_STORE, MESSAGE_STORE], 'readwrite');
  const metaStore = transaction.objectStore(META_STORE);
  const meta = (await requestResult<StoredUserMeta | undefined>(metaStore.get(userId))) ?? {
    userId,
    generation,
    tombstones: {},
  };
  if (meta.generation !== generation) {
    transaction.abort();
    throw staleWriteError();
  }
  meta.tombstones = { ...meta.tombstones, [conversationId]: Date.now() };
  metaStore.put(meta);
  const conversationStore = transaction.objectStore(CONVERSATION_STORE);
  const existing = await requestResult<StoredConversation | undefined>(
    conversationStore.get(conversationKey(userId, conversationId)),
  );
  conversationStore.delete(conversationKey(userId, conversationId));
  const messageStore = transaction.objectStore(MESSAGE_STORE);
  const keys = await requestResult<IDBValidKey[]>(
    messageStore.index('byUserConversation').getAllKeys(IDBKeyRange.only([userId, conversationId])),
  );
  keys.forEach((key) => messageStore.delete(key));
  await transactionDone(transaction);
  return Boolean(existing);
}

export async function clearDeviceData(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  try {
    await dataService.deleteLifeLocalDataSession();
  } catch (error) {
    const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
    if (status !== 409 && status !== 404) throw error;
  }
  const db = await openDatabase();
  const transaction = db.transaction(
    [META_STORE, CONVERSATION_STORE, MESSAGE_STORE, SNAPSHOT_STORE],
    'readwrite',
  );
  const metaStore = transaction.objectStore(META_STORE);
  const currentMeta = await requestResult<StoredUserMeta | undefined>(metaStore.get(userId));
  const nextGeneration = Math.max(runtime.dataGeneration, currentMeta?.generation ?? 0) + 1;
  metaStore.put({
    userId,
    generation: nextGeneration,
    tombstones: {},
  } satisfies StoredUserMeta);
  const conversations = await requestResult<StoredConversation[]>(
    transaction.objectStore(CONVERSATION_STORE).getAll(),
  );
  conversations
    .filter((row) => row.userId === userId)
    .forEach((row) => {
      transaction.objectStore(CONVERSATION_STORE).delete(row.key);
    });
  const messages = await requestResult<StoredMessage[]>(
    transaction.objectStore(MESSAGE_STORE).getAll(),
  );
  messages
    .filter((row) => row.userId === userId)
    .forEach((row) => {
      transaction.objectStore(MESSAGE_STORE).delete(row.key);
    });
  transaction.objectStore(SNAPSHOT_STORE).delete(userId);
  await transactionDone(transaction);
  authGeneration += 1;
  runtime = { ...runtime, dataGeneration: nextGeneration };
  preparePromise = null;
  snapshotWriteState = null;
  localSessionPrepared = false;
  localSessionId = null;
  setLocalDataSessionHeader(undefined);
  localDataChannel?.postMessage({ type: 'cleared', userId, generation: nextGeneration });
}

function enrichBootstrapWithDeviceConversations(
  bootstrap: LifeBootstrapResponse,
  conversations: TConversation[],
): LifeBootstrapResponse {
  const concreteConversations = conversations.filter(
    (conversation): conversation is TConversation & { conversationId: string } =>
      typeof conversation.conversationId === 'string' && conversation.conversationId.length > 0,
  );
  const byId = new Map(
    concreteConversations.map((conversation) => [conversation.conversationId, conversation]),
  );
  const sessions = Array.isArray(bootstrap.houseSessions) ? bootstrap.houseSessions : [];
  const mappedIds = new Set<string>();
  const domainConversations = sessions.flatMap((session) => {
    const conversation = byId.get(session.sessionId);
    if (!conversation) return [];
    mappedIds.add(session.sessionId);
    return [
      {
        entryHouse: session.entryHouse,
        conversationId: session.sessionId,
        title: conversation.title || null,
        updatedAt: typeof conversation.updatedAt === 'string' ? conversation.updatedAt : null,
        stopPoint: session.stopPoint || null,
      },
    ];
  });
  const unscopedConversations = concreteConversations
    .filter((conversation) => !mappedIds.has(conversation.conversationId))
    .slice(0, 6)
    .map((conversation) => ({
      conversationId: conversation.conversationId,
      title: conversation.title || null,
      updatedAt: typeof conversation.updatedAt === 'string' ? conversation.updatedAt : null,
    }));
  const active =
    domainConversations.find((item) => item.entryHouse === bootstrap.activeHouse) ||
    domainConversations[0] ||
    unscopedConversations[0] ||
    null;
  return {
    ...bootstrap,
    domainConversations,
    unscopedConversations,
    lastConversationId: active?.conversationId || null,
    lastConversationTitle: active?.title || null,
    recommendedRoute:
      bootstrap.hasSubstantiveProfile || conversations.length > 0 ? '/resume' : '/home',
  };
}

export async function prepareLifeBootstrap(): Promise<LifeBootstrapResponse> {
  const generation = authGeneration;
  if (preparePromise?.generation === generation) return preparePromise.promise;
  const promise = (async () => {
    const storage = await dataService.getLifeDataStorage();
    if (generation !== authGeneration) throw staleWriteError();
    const sameDeviceUser = runtime.mode === 'device' && runtime.userId === storage.userId;
    const meta =
      storage.mode === 'device' && storage.userId ? await loadUserMeta(storage.userId) : null;
    if (generation !== authGeneration) throw staleWriteError();
    runtime = {
      mode: storage.mode,
      userId: storage.mode === 'device' ? storage.userId : null,
      notice: storage.notice,
      dataGeneration: meta?.generation ?? 0,
    };
    if (storage.mode !== 'device' || !storage.userId) {
      localSessionPrepared = false;
      localSessionId = null;
      setLocalDataSessionHeader(undefined);
      return dataService.getLifeBootstrap();
    }
    if (!sameDeviceUser) {
      localSessionPrepared = false;
      localSessionId = null;
      setLocalDataSessionHeader(undefined);
    }
    await requestPersistentStorage();
    let session: { sessionId: string } | null = null;
    try {
      session = await dataService.getLifeLocalDataSession();
    } catch (error) {
      const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
      if (status !== 409 && status !== 404) throw error;
    }
    if (!session) {
      const [snapshot, transcripts] = await Promise.all([
        loadEngineSnapshot(storage.userId),
        allStoredMessages(storage.userId),
      ]);
      try {
        session = await dataService.createLifeLocalDataSession({ snapshot, transcripts });
      } catch (error) {
        const status = Number((error as { response?: { status?: number } })?.response?.status || 0);
        if (status !== 409) throw error;
        session = await dataService.getLifeLocalDataSession();
      }
    }
    if (generation !== authGeneration || runtime.userId !== storage.userId) throw staleWriteError();
    localSessionId = session.sessionId;
    localSessionPrepared = true;
    setLocalDataSessionHeader(localSessionId);
    const [bootstrap, conversations] = await Promise.all([
      dataService.getLifeBootstrap(),
      listDeviceConversations(),
    ]);
    if (generation !== authGeneration) throw staleWriteError();
    return enrichBootstrapWithDeviceConversations(bootstrap, conversations);
  })();
  preparePromise = { generation, promise };
  try {
    return await promise;
  } finally {
    if (preparePromise?.generation === generation) preparePromise = null;
  }
}

export async function persistDeviceEngineSnapshot(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const auth = authGeneration;
  const dataGeneration = runtime.dataGeneration;
  if (
    snapshotWriteState?.authGeneration === auth &&
    snapshotWriteState.userId === userId &&
    snapshotWriteState.dataGeneration === dataGeneration
  ) {
    snapshotWriteState.requested = true;
    return snapshotWriteState.promise;
  }
  const state = {
    authGeneration: auth,
    userId,
    dataGeneration,
    requested: true,
    promise: Promise.resolve(),
  };
  state.promise = (async () => {
    while (state.requested) {
      state.requested = false;
      assertRuntimeContext(userId, dataGeneration, auth);
      const result = await dataService.getLifeLocalDataSnapshot();
      await saveEngineSnapshot(userId, result.snapshot, dataGeneration, auth);
    }
  })().finally(() => {
    if (snapshotWriteState === state) snapshotWriteState = null;
  });
  snapshotWriteState = state;
  return state.promise;
}
