import { dataService } from 'librechat-data-provider';
import type {
  LifeBootstrapResponse,
  LifeEngineSnapshot,
  LifeLocalConversationSummary,
  TConversation,
  TMessage,
} from 'librechat-data-provider';

const DB_NAME = 'future-lines-device-data';
const DB_VERSION = 1;
const META_STORE = 'meta';
const CONVERSATION_STORE = 'conversations';
const MESSAGE_STORE = 'messages';
const SNAPSHOT_STORE = 'engineSnapshots';

type DeviceRuntime = {
  mode: 'server' | 'device' | 'unknown';
  userId: string | null;
  notice: string | null;
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
  value: TMessage;
};

type StoredSnapshot = {
  userId: string;
  snapshot: LifeEngineSnapshot;
  updatedAt: string;
};

let runtime: DeviceRuntime = { mode: 'unknown', userId: null, notice: null };
let databasePromise: Promise<IDBDatabase> | null = null;
let preparePromise: Promise<LifeBootstrapResponse> | null = null;
let snapshotWritePromise: Promise<void> | null = null;
let snapshotWriteRequested = false;
let localSessionPrepared = false;

if (typeof window !== 'undefined') {
  window.addEventListener('futureLinesLifeMutationCompleted', () => {
    if (!isDeviceDataMode() || !localSessionPrepared) return;
    void persistDeviceEngineSnapshot().catch((error) => {
      console.error('[local-data] failed to persist life mutation snapshot', error);
    });
  });
}

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
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开未来线本地数据空间'));
    request.onblocked = () => reject(new Error('未来线本地数据空间正在被另一个页面占用'));
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

async function saveEngineSnapshot(userId: string, snapshot: LifeEngineSnapshot): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite');
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
  ).filter((row) => row.userId === userId);
  await transactionDone(transaction);
  return rows.slice(-2000).map((row) => row.value);
}

export async function getDeviceConversation(conversationId: string): Promise<TConversation> {
  const userId = currentUserId();
  if (!userId) throw new Error('设备本地数据模式尚未准备好');
  const db = await openDatabase();
  const transaction = db.transaction(CONVERSATION_STORE, 'readonly');
  const row = await requestResult<StoredConversation | undefined>(
    transaction.objectStore(CONVERSATION_STORE).get(conversationKey(userId, conversationId)),
  );
  await transactionDone(transaction);
  if (!row) throw Object.assign(new Error('本地对话不存在'), { status: 404 });
  return row.value;
}

export async function getDeviceMessages(conversationId: string): Promise<TMessage[]> {
  const userId = currentUserId();
  if (!userId) throw new Error('设备本地数据模式尚未准备好');
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
  if (!userId) throw new Error('设备本地数据模式尚未准备好');
  const current = await getDeviceConversation(conversationId);
  const now = new Date().toISOString();
  const value = { ...current, ...patch, conversationId, updatedAt: now } as TConversation;
  const db = await openDatabase();
  const transaction = db.transaction(CONVERSATION_STORE, 'readwrite');
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
  if (current && current !== 'New Chat' && current !== '新对话') return current;
  const firstUserText = messages.find((message) => message.isCreatedByUser)?.text;
  if (typeof firstUserText !== 'string' || !firstUserText.trim()) return '新对话';
  return (
    firstUserText
      .replace(/^\[trigger:[^\]]+\]\s*/, '')
      .trim()
      .slice(0, 18) || '新对话'
  );
}

export async function saveDeviceConversationTurn(
  conversation: TConversation,
  messages: TMessage[],
): Promise<void> {
  const userId = currentUserId();
  const conversationId = conversation?.conversationId;
  if (!userId || !conversationId || !Array.isArray(messages) || messages.length === 0) return;
  const db = await openDatabase();
  const transaction = db.transaction([CONVERSATION_STORE, MESSAGE_STORE], 'readwrite');
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
  if (!userId) return false;
  const db = await openDatabase();
  const transaction = db.transaction([CONVERSATION_STORE, MESSAGE_STORE], 'readwrite');
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
  const db = await openDatabase();
  const transaction = db.transaction(
    [CONVERSATION_STORE, MESSAGE_STORE, SNAPSHOT_STORE],
    'readwrite',
  );
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
  await dataService.deleteLifeLocalDataSession().catch(() => undefined);
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
  if (preparePromise) return preparePromise;
  preparePromise = (async () => {
    const storage = await dataService.getLifeDataStorage();
    const sameDeviceUser = runtime.mode === 'device' && runtime.userId === storage.userId;
    runtime = {
      mode: storage.mode,
      userId: storage.mode === 'device' ? storage.userId : null,
      notice: storage.notice,
    };
    if (storage.mode !== 'device' || !storage.userId) {
      localSessionPrepared = false;
      return dataService.getLifeBootstrap();
    }
    if (!sameDeviceUser) localSessionPrepared = false;
    await requestPersistentStorage();
    if (localSessionPrepared) {
      await dataService.getLifeLocalDataSession().catch(() => {
        localSessionPrepared = false;
      });
    }
    if (!localSessionPrepared) {
      const [snapshot, transcripts] = await Promise.all([
        loadEngineSnapshot(storage.userId),
        allStoredMessages(storage.userId),
      ]);
      await dataService.createLifeLocalDataSession({ snapshot, transcripts });
      localSessionPrepared = true;
    }
    const [bootstrap, conversations] = await Promise.all([
      dataService.getLifeBootstrap(),
      listDeviceConversations(),
    ]);
    return enrichBootstrapWithDeviceConversations(bootstrap, conversations);
  })();
  try {
    return await preparePromise;
  } finally {
    preparePromise = null;
  }
}

export async function persistDeviceEngineSnapshot(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  snapshotWriteRequested = true;
  if (snapshotWritePromise) return snapshotWritePromise;
  snapshotWritePromise = (async () => {
    while (snapshotWriteRequested) {
      snapshotWriteRequested = false;
      const result = await dataService.getLifeLocalDataSnapshot();
      await saveEngineSnapshot(userId, result.snapshot);
    }
  })().finally(() => {
    snapshotWritePromise = null;
  });
  return snapshotWritePromise;
}
