import { createHash } from 'node:crypto';
import { Constants } from 'librechat-data-provider';
import type { TEndpointOption, TFile, TMessage } from 'librechat-data-provider';

/** Minimal shape for request file entries (from `req.body.files`) */
type RequestFile = { file_id?: string };

type GetMessagesByParentId = (
  filter: { user: string; messageId: string; conversationId?: string },
  select: '_id',
) => Promise<unknown[]>;

type SubmissionRequestFile = {
  file_id?: string;
  filepath?: string;
  filename?: string;
  type?: string;
};

type SubmissionMessage = {
  messageId?: string;
  createdAt?: Date | string;
};

type GetSubmissionMessages = (
  filter: {
    user: string;
    conversationId: string;
    parentMessageId: string;
    isCreatedByUser: boolean;
    text?: string | { $in: string[] };
    endpoint?: string;
    model?: string;
  },
  select: 'messageId' | 'messageId createdAt',
  options: { sort: { createdAt: 1 }; limit: 1 },
) => Promise<SubmissionMessage[]>;

export type ChatSubmissionIdentityInput = {
  userId: string;
  conversationId: string;
  parentMessageId?: string | null;
  text?: string | null;
  endpoint?: string | null;
  endpointType?: string | null;
  agentId?: string | null;
  model?: string | null;
  spec?: string | null;
  promptPrefix?: string | null;
  ephemeralAgent?: Record<string, unknown> | null;
  addedConvo?: Record<string, unknown> | null;
  modelParameters?: Record<string, unknown> | null;
  files?: SubmissionRequestFile[] | null;
  quotes?: string[] | null;
  manualSkills?: string[] | null;
  alwaysAppliedSkills?: string[] | null;
  endpointOption?: TEndpointOption | null;
  isTemporary?: boolean | null;
  timezone?: string | null;
};

export type ChatSubmissionIdentity = {
  submissionKey: string;
  userMessageId: string;
  responseMessageId: string;
  source: 'derived' | 'existing';
};

/** Fields to strip from files before client transmission */
const FILE_STRIP_FIELDS = ['text', '_id', '__v'] as const;

/** Fields to strip from messages before client transmission */
const MESSAGE_STRIP_FIELDS = ['fileContext'] as const;
const LEGACY_SUBMISSION_REUSE_WINDOW_MS = 30 * 60 * 1000;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeSubmissionText = (value?: string | null): string => (value ?? '').trim();

const normalizeOrderedStringList = (values?: string[] | null): string[] =>
  (values ?? []).map((value) => value.trim()).filter(Boolean);

const normalizeUnorderedStringList = (values?: string[] | null): string[] =>
  normalizeOrderedStringList(values).sort();

const NON_GENERATION_ENDPOINT_OPTION_KEYS = new Set([
  'agent',
  'attachments',
  'chatGptLabel',
  'greeting',
  'iconURL',
  'key',
  'modelDisplayLabel',
  'modelLabel',
  'modelsConfig',
  'overrideConvoId',
  'overrideUserMessageId',
  'thread_id',
]);

const canonicalizeSubmissionValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalizeSubmissionValue);
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalizeSubmissionValue(record[key])]),
  );
};

const normalizeEndpointOption = (endpointOption?: TEndpointOption | null): unknown => {
  if (!endpointOption) {
    return null;
  }

  return canonicalizeSubmissionValue(
    Object.fromEntries(
      Object.entries(endpointOption).filter(
        ([key]) => !NON_GENERATION_ENDPOINT_OPTION_KEYS.has(key),
      ),
    ),
  );
};

const normalizeRequestFiles = (files?: SubmissionRequestFile[] | null): string[][] =>
  (files ?? []).map((file) => [
    file.file_id ?? '',
    file.filepath ?? '',
    file.filename ?? '',
    file.type ?? '',
  ]);

const deterministicUuid = (seed: string): string => {
  const bytes = Buffer.from(createHash('sha256').update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function deriveChatConversationId({
  userId,
  clientMessageId,
}: {
  userId: string;
  clientMessageId?: string | null;
}): string | null {
  if (!userId || !clientMessageId) {
    return null;
  }
  return deterministicUuid(`chat-conversation-v1:${userId}:${clientMessageId}`);
}

const isRecentLegacySubmissionPair = ({
  userMessage,
  responseMessage,
  now,
}: {
  userMessage: SubmissionMessage;
  responseMessage: SubmissionMessage;
  now: number;
}): boolean => {
  if (
    !userMessage.messageId ||
    !responseMessage.messageId ||
    !UUID_V4_PATTERN.test(userMessage.messageId) ||
    !UUID_V4_PATTERN.test(responseMessage.messageId)
  ) {
    return false;
  }

  const createdAt = new Date(userMessage.createdAt ?? 0).getTime();
  return Number.isFinite(createdAt) && now - createdAt <= LEGACY_SUBMISSION_REUSE_WINDOW_MS;
};

const hasNonMigratableSubmissionMetadata = (input: ChatSubmissionIdentityInput): boolean =>
  (input.files?.length ?? 0) > 0 ||
  (input.quotes?.length ?? 0) > 0 ||
  (input.manualSkills?.length ?? 0) > 0 ||
  (input.alwaysAppliedSkills?.length ?? 0) > 0 ||
  input.addedConvo != null ||
  input.isTemporary === true;

export async function resolveChatSubmissionIdentity({
  input,
  getMessages,
  now = Date.now(),
}: {
  input: ChatSubmissionIdentityInput;
  getMessages: GetSubmissionMessages;
  now?: number;
}): Promise<ChatSubmissionIdentity> {
  const parentMessageId = input.parentMessageId ?? Constants.NO_PARENT;
  const normalizedText = normalizeSubmissionText(input.text);
  const submissionKey = createHash('sha256')
    .update(
      JSON.stringify([
        'chat-submission-v1',
        input.userId,
        input.conversationId,
        parentMessageId,
        normalizedText,
        input.endpoint ?? '',
        input.endpointType ?? '',
        input.agentId ?? '',
        input.model ?? '',
        input.spec ?? '',
        input.promptPrefix ?? '',
        canonicalizeSubmissionValue(input.ephemeralAgent),
        canonicalizeSubmissionValue(input.addedConvo),
        canonicalizeSubmissionValue(input.modelParameters),
        normalizeRequestFiles(input.files),
        normalizeOrderedStringList(input.quotes),
        normalizeUnorderedStringList(input.manualSkills),
        normalizeUnorderedStringList(input.alwaysAppliedSkills),
        normalizeEndpointOption(input.endpointOption),
        input.isTemporary === true,
        input.timezone ?? '',
      ]),
    )
    .digest('hex');
  const derived: ChatSubmissionIdentity = {
    submissionKey,
    userMessageId: deterministicUuid(`user:${submissionKey}`),
    responseMessageId: deterministicUuid(`assistant:${submissionKey}`),
    source: 'derived',
  };

  if (
    input.conversationId === Constants.NEW_CONVO ||
    !normalizedText ||
    hasNonMigratableSubmissionMetadata(input)
  ) {
    return derived;
  }

  const [existingUserMessage] = await getMessages(
    {
      user: input.userId,
      conversationId: input.conversationId,
      parentMessageId,
      isCreatedByUser: true,
      text:
        input.text === normalizedText
          ? normalizedText
          : { $in: [input.text ?? '', normalizedText] },
    },
    'messageId createdAt',
    { sort: { createdAt: 1 }, limit: 1 },
  );
  if (!existingUserMessage?.messageId) {
    return derived;
  }

  const responseModel = input.agentId ?? input.model;
  const [existingResponseMessage] = await getMessages(
    {
      user: input.userId,
      conversationId: input.conversationId,
      parentMessageId: existingUserMessage.messageId,
      isCreatedByUser: false,
      ...(input.endpoint ? { endpoint: input.endpoint } : {}),
      ...(responseModel ? { model: responseModel } : {}),
    },
    'messageId',
    { sort: { createdAt: 1 }, limit: 1 },
  );

  if (!existingResponseMessage?.messageId) {
    return derived;
  }

  const matchesDerivedIdentity =
    existingUserMessage.messageId === derived.userMessageId &&
    existingResponseMessage.messageId === derived.responseMessageId;
  if (
    !matchesDerivedIdentity &&
    !isRecentLegacySubmissionPair({
      userMessage: existingUserMessage,
      responseMessage: existingResponseMessage,
      now,
    })
  ) {
    return derived;
  }

  return {
    submissionKey,
    userMessageId: existingUserMessage.messageId,
    responseMessageId: existingResponseMessage.messageId,
    source: 'existing',
  };
}

/**
 * Strips large/unnecessary fields from a file object before transmitting to client.
 * Use this within existing loops when building file arrays to avoid extra iterations.
 *
 * @param file - The file object to sanitize
 * @returns A new file object without the stripped fields
 *
 * @example
 * // Use in existing file processing loop:
 * for (const attachment of client.options.attachments) {
 *   if (messageFiles.has(attachment.file_id)) {
 *     userMessage.files.push(sanitizeFileForTransmit(attachment));
 *   }
 * }
 */
export function sanitizeFileForTransmit<T extends Partial<TFile>>(
  file: T,
): Omit<T, (typeof FILE_STRIP_FIELDS)[number]> {
  const sanitized = { ...file };
  for (const field of FILE_STRIP_FIELDS) {
    delete sanitized[field as keyof typeof sanitized];
  }
  return sanitized;
}

/** Filters attachments to those whose `file_id` appears in `requestFiles`, then sanitizes each. */
export function buildMessageFiles<T extends Partial<TFile>>(
  requestFiles: RequestFile[],
  attachments: T[],
): Omit<T, (typeof FILE_STRIP_FIELDS)[number]>[] {
  const requestFileIds = new Set<string>();
  for (const f of requestFiles) {
    if (f.file_id) {
      requestFileIds.add(f.file_id);
    }
  }

  const files: Omit<T, (typeof FILE_STRIP_FIELDS)[number]>[] = [];
  for (const attachment of attachments) {
    if (attachment.file_id != null && requestFileIds.has(attachment.file_id)) {
      files.push(sanitizeFileForTransmit(attachment));
    }
  }
  return files;
}

/**
 * Sanitizes a message object before transmitting to client.
 * Removes large fields like `fileContext` and strips `text` from embedded files.
 *
 * @param message - The message object to sanitize
 * @returns A new message object safe for client transmission
 *
 * @example
 * sendEvent(res, {
 *   final: true,
 *   requestMessage: sanitizeMessageForTransmit(userMessage),
 *   responseMessage: response,
 * });
 */
export function sanitizeMessageForTransmit<T extends Partial<TMessage>>(
  message: T,
): Omit<T, (typeof MESSAGE_STRIP_FIELDS)[number]> {
  if (!message) {
    return message as Omit<T, (typeof MESSAGE_STRIP_FIELDS)[number]>;
  }

  const sanitized = { ...message };

  // Remove message-level fields
  for (const field of MESSAGE_STRIP_FIELDS) {
    delete sanitized[field as keyof typeof sanitized];
  }

  // Always create a new array when files exist to maintain full immutability
  if (Array.isArray(sanitized.files)) {
    sanitized.files = sanitized.files.map((file) => sanitizeFileForTransmit(file));
  }

  return sanitized;
}

export function isPreliminaryMessageId(messageId: unknown): messageId is string {
  return typeof messageId === 'string' && messageId.endsWith('_');
}

export async function isUnpersistedPreliminaryParent({
  userId,
  conversationId,
  parentMessageId,
  getMessages,
}: {
  userId: string;
  conversationId?: string | null;
  parentMessageId?: string | null;
  getMessages: GetMessagesByParentId;
}): Promise<boolean> {
  if (!isPreliminaryMessageId(parentMessageId)) {
    return false;
  }

  const filter: { user: string; messageId: string; conversationId?: string } = {
    user: userId,
    messageId: parentMessageId,
  };
  if (conversationId && conversationId !== Constants.NEW_CONVO) {
    filter.conversationId = conversationId;
  }

  const messages = await getMessages(filter, '_id');
  return messages.length === 0;
}

/** Minimal message shape for thread traversal.
 *
 * Both `files` and `attachments` carry `file_id` references, but they
 * land on different roles by convention: user-uploaded files live on
 * `messages.files` (set when the user attaches a file in chat), while
 * code-execution outputs live on `messages.attachments` (set by
 * `processCodeOutput` when a tool call produces a file). The thread
 * walk must visit both so the next turn's `tool_resources.execute_code.file_ids`
 * picks up files the assistant generated, not just files the user
 * uploaded. */
type ThreadMessage = {
  messageId: string;
  parentMessageId?: string | null;
  files?: Array<{ file_id?: string }>;
  attachments?: Array<{ file_id?: string }>;
};

/** Result of thread data extraction */
export type ThreadData = {
  messageIds: string[];
  fileIds: string[];
};

/**
 * Extracts thread message IDs and file IDs in a single O(n) pass.
 * Builds a Map for O(1) lookups, then traverses the thread collecting both IDs.
 *
 * @param messages - All messages in the conversation (should be queried with select for efficiency)
 * @param parentMessageId - The ID of the parent message to start traversal from
 * @returns Object containing messageIds and fileIds arrays
 */
export function getThreadData(
  messages: ThreadMessage[],
  parentMessageId: string | null | undefined,
): ThreadData {
  const result: ThreadData = { messageIds: [], fileIds: [] };

  if (!messages || messages.length === 0 || !parentMessageId) {
    return result;
  }

  /** Build Map for O(1) lookups instead of O(n) .find() calls */
  const messageMap = new Map<string, ThreadMessage>();
  for (const msg of messages) {
    messageMap.set(msg.messageId, msg);
  }

  const fileIdSet = new Set<string>();
  const visitedIds = new Set<string>();
  let currentId: string | null | undefined = parentMessageId;

  /** Single traversal: collect message IDs and file IDs together */
  while (currentId) {
    if (visitedIds.has(currentId)) {
      break;
    }
    visitedIds.add(currentId);

    const message = messageMap.get(currentId);
    if (!message) {
      break;
    }

    result.messageIds.push(message.messageId);

    /** Collect file IDs from BOTH `files` (user uploads) and
     *  `attachments` (code-execution outputs from `processCodeOutput`).
     *  Walking only one half drops half the relevant refs — see
     *  the type doc on `ThreadMessage` for the role split. */
    if (message.files) {
      for (const file of message.files) {
        if (file.file_id) {
          fileIdSet.add(file.file_id);
        }
      }
    }
    if (message.attachments) {
      for (const attachment of message.attachments) {
        if (attachment.file_id) {
          fileIdSet.add(attachment.file_id);
        }
      }
    }

    currentId = message.parentMessageId === Constants.NO_PARENT ? null : message.parentMessageId;
  }

  result.fileIds = Array.from(fileIdSet);
  return result;
}
