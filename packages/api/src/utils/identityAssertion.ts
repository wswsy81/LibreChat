import { createHmac, randomUUID } from 'node:crypto';

export const FUTURE_ENGINE_IDENTITY_PLACEHOLDER = '{{LIBRECHAT_FUTURE_ENGINE_IDENTITY}}';
export const FUTURE_ENGINE_IDENTITY_HEADER = 'X-LibreChat-Identity';
export const FUTURE_ENGINE_IDENTITY_AUDIENCE = 'future-engine';
export const FUTURE_ENGINE_IDENTITY_TTL_SECONDS = 60;

export interface FutureEngineIdentityAssertionOptions {
  principalId: string;
  secret: string;
  scope: 'mcp' | 'life-api';
  now?: number | Date;
  ttlSeconds?: number;
  jti?: string;
}

function epochSeconds(now: number | Date): number {
  const value = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(value)) {
    throw new Error('FUTURE_ENGINE_IDENTITY clock is invalid');
  }
  return Math.floor(value > 10_000_000_000 ? value / 1000 : value);
}

function requireSecret(secret: string): string {
  const value = typeof secret === 'string' ? secret : '';
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('FUTURE_ENGINE_IDENTITY_SECRET must contain at least 32 bytes');
  }
  return value;
}

function requirePrincipal(principalId: string): string {
  const value = typeof principalId === 'string' ? principalId.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (!value || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('future-engine identity principal is invalid');
  }
  return value;
}

export function createFutureEngineIdentityAssertion({
  principalId,
  secret,
  scope,
  now = Date.now(),
  ttlSeconds = FUTURE_ENGINE_IDENTITY_TTL_SECONDS,
  jti = randomUUID(),
}: FutureEngineIdentityAssertionOptions): string {
  const signingSecret = requireSecret(secret);
  const sub = requirePrincipal(principalId);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 60) {
    throw new Error('future-engine identity ttl is invalid');
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(jti)) {
    throw new Error('future-engine identity nonce is invalid');
  }

  const iat = epochSeconds(now);
  const payload = {
    v: 1,
    sub,
    aud: FUTURE_ENGINE_IDENTITY_AUDIENCE,
    scope,
    iat,
    exp: iat + ttlSeconds,
    jti,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `v1.${encoded}`;
  const signature = createHmac('sha256', signingSecret).update(message).digest('base64url');
  return `${message}.${signature}`;
}
