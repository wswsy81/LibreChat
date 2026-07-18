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
}

export interface LifeEngineClient {
  json<T extends object>(path: string, options?: LifeEngineRequestOptions): Promise<T>;
  text(path: string, options?: LifeEngineRequestOptions): Promise<string>;
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
