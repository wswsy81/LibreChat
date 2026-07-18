import {
  createFutureEngineIdentityAssertion,
  FUTURE_ENGINE_IDENTITY_HEADER,
} from '../utils/identityAssertion';

export interface LifeEngineClientOptions {
  baseUrl: string;
  token: string;
  identitySecret: string;
}

export interface LifeEngineRequestOptions {
  userId?: string;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: object;
  operation?: {
    id: string;
    name: string;
    requestHash: string;
  };
}

export interface LifeEngineClient {
  json<T extends object>(path: string, options?: LifeEngineRequestOptions): Promise<T>;
  text(path: string, options?: LifeEngineRequestOptions): Promise<string>;
}

export interface LifeAccountDeletionReceipt {
  schemaVersion: 1;
  deletionId: string;
  status: 'completed';
  planned: {
    profile: { files: number };
    reports: { reports: number; reportFiles: number; shares: number };
    analysisRows: number;
  };
  remaining: {
    profile: { files: 0 };
    reports: { reports: 0; reportFiles: 0; shares: 0 };
    analysisRows: 0;
  };
  completedAt: string;
  replayed?: boolean;
}

export interface DeleteLifeAccountDataOptions {
  userId: string;
  operationId: string;
  requestHash: string;
  baseUrl?: string;
  token?: string;
  identitySecret?: string;
}

export class LifeEngineError extends Error {
  status: number;
  payload: object | null;

  constructor(status: number, message: string, payload: object | null) {
    super(message);
    this.name = 'LifeEngineError';
    this.status = status;
    this.payload = payload;
  }
}

export class LifeAccountDeletionReceiptError extends Error {
  code = 'INVALID_LIFE_ACCOUNT_DELETION_RECEIPT';

  constructor(message: string) {
    super(message);
    this.name = 'LifeAccountDeletionReceiptError';
  }
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isObject(value: unknown): value is object {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseInventory(
  value: unknown,
  requireEmpty: boolean,
): LifeAccountDeletionReceipt['planned'] {
  if (!isObject(value)) {
    throw new LifeAccountDeletionReceiptError('future-engine deletion inventory is malformed');
  }
  const profile = Reflect.get(value, 'profile');
  const reports = Reflect.get(value, 'reports');
  if (!isObject(profile) || !isObject(reports)) {
    throw new LifeAccountDeletionReceiptError('future-engine deletion inventory is malformed');
  }
  const files = Reflect.get(profile, 'files');
  const reportCount = Reflect.get(reports, 'reports');
  const reportFiles = Reflect.get(reports, 'reportFiles');
  const shares = Reflect.get(reports, 'shares');
  const analysisRows = Reflect.get(value, 'analysisRows');
  if (
    !isCount(files) ||
    !isCount(reportCount) ||
    !isCount(reportFiles) ||
    !isCount(shares) ||
    !isCount(analysisRows) ||
    (requireEmpty &&
      [files, reportCount, reportFiles, shares, analysisRows].some((count) => count !== 0))
  ) {
    throw new LifeAccountDeletionReceiptError(
      requireEmpty
        ? 'future-engine deletion receipt reports remaining account data'
        : 'future-engine deletion inventory contains invalid counts',
    );
  }
  return {
    profile: { files },
    reports: { reports: reportCount, reportFiles, shares },
    analysisRows,
  };
}

function parseLifeAccountDeletionReceipt(value: unknown): LifeAccountDeletionReceipt {
  if (!isObject(value)) {
    throw new LifeAccountDeletionReceiptError('future-engine deletion receipt is malformed');
  }
  const schemaVersion = Reflect.get(value, 'schemaVersion');
  const status = Reflect.get(value, 'status');
  const deletionId = Reflect.get(value, 'deletionId');
  const completedAt = Reflect.get(value, 'completedAt');
  const replayed = Reflect.get(value, 'replayed');
  if (
    schemaVersion !== 1 ||
    status !== 'completed' ||
    typeof deletionId !== 'string' ||
    deletionId.length === 0 ||
    typeof completedAt !== 'string' ||
    Number.isNaN(Date.parse(completedAt)) ||
    (replayed !== undefined && typeof replayed !== 'boolean')
  ) {
    throw new LifeAccountDeletionReceiptError('future-engine deletion receipt is malformed');
  }
  const planned = parseInventory(Reflect.get(value, 'planned'), false);
  parseInventory(Reflect.get(value, 'remaining'), true);
  return {
    schemaVersion: 1,
    deletionId,
    status: 'completed',
    planned,
    remaining: {
      profile: { files: 0 },
      reports: { reports: 0, reportFiles: 0, shares: 0 },
      analysisRows: 0,
    },
    completedAt,
    ...(replayed === undefined ? {} : { replayed }),
  };
}

export function createLifeEngineClient({
  baseUrl,
  token,
  identitySecret,
}: LifeEngineClientOptions): LifeEngineClient {
  const root = baseUrl.replace(/\/+$/, '');

  async function request(path: string, options: LifeEngineRequestOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (options.userId) {
      headers[FUTURE_ENGINE_IDENTITY_HEADER] = createFutureEngineIdentityAssertion({
        principalId: options.userId,
        secret: identitySecret,
        scope: 'life-api',
      });
    }
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.operation) {
      headers['X-Life-Operation-Id'] = options.operation.id;
      headers['X-Life-Operation'] = options.operation.name;
      headers['X-Life-Request-Hash'] = options.operation.requestHash;
    }
    return fetch(`${root}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  }

  async function json<T extends object>(
    path: string,
    options: LifeEngineRequestOptions = {},
  ): Promise<T> {
    const response = await request(path, options);
    const payload = (await response.json().catch(() => null)) as object | null;
    if (!response.ok) {
      const errorPayload = payload as { error?: { message?: string } } | null;
      throw new LifeEngineError(
        response.status,
        errorPayload?.error?.message ?? `future-engine request failed (${response.status})`,
        payload,
      );
    }
    return payload as T;
  }

  async function text(path: string, options: LifeEngineRequestOptions = {}): Promise<string> {
    const response = await request(path, options);
    const payload = await response.text();
    if (!response.ok) {
      throw new LifeEngineError(response.status, payload || 'future-engine request failed', null);
    }
    return payload;
  }

  return { json, text };
}

export async function deleteLifeAccountData({
  userId,
  operationId,
  requestHash,
  baseUrl = process.env.FUTURE_ENGINE_URL ?? 'http://future-engine:8899',
  token = process.env.FUTURE_ENGINE_INTERNAL_TOKEN ?? 'future-lines-local-internal',
  identitySecret = process.env.FUTURE_ENGINE_IDENTITY_SECRET ?? '',
}: DeleteLifeAccountDataOptions): Promise<LifeAccountDeletionReceipt> {
  const client = createLifeEngineClient({ baseUrl, token, identitySecret });
  const receipt = await client.json<object>('/internal/account', {
    userId,
    method: 'DELETE',
    body: { schemaVersion: 1 },
    operation: {
      id: operationId,
      name: 'account-delete',
      requestHash,
    },
  });
  return parseLifeAccountDeletionReceipt(receipt);
}
