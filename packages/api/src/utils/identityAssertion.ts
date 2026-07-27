import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const FUTURE_ENGINE_IDENTITY_PLACEHOLDER = '{{LIBRECHAT_FUTURE_ENGINE_IDENTITY}}';
export const FUTURE_ENGINE_IDENTITY_HEADER = 'X-LibreChat-Identity';
export const FUTURE_ENGINE_IDENTITY_AUDIENCE = 'future-engine';
export const FUTURE_ENGINE_IDENTITY_TTL_SECONDS = 60;
export const ADVISOR_GATEWAY_IDENTITY_PLACEHOLDER = '{{LIBRECHAT_ADVISOR_GATEWAY_IDENTITY}}';
export const ADVISOR_GATEWAY_IDENTITY_HEADER = 'X-LibreChat-Advisor-Identity';
export const ADVISOR_GATEWAY_IDENTITY_TTL_SECONDS = 300;

interface RuntimeIdentityPolicy {
  trustedHeader: string;
  advisorTrustedHeader: string;
  audience: string;
  maxTtlMsByScope: {
    mcp: number;
    'life-api': number;
    'advisor-gateway': number;
  };
}

let identityPolicyCache: { fingerprint: string; policy: RuntimeIdentityPolicy } | null = null;

function defaultIdentityPolicy(): RuntimeIdentityPolicy {
  return {
    trustedHeader: FUTURE_ENGINE_IDENTITY_HEADER,
    advisorTrustedHeader: ADVISOR_GATEWAY_IDENTITY_HEADER,
    audience: FUTURE_ENGINE_IDENTITY_AUDIENCE,
    maxTtlMsByScope: {
      mcp: FUTURE_ENGINE_IDENTITY_TTL_SECONDS * 1000,
      'life-api': FUTURE_ENGINE_IDENTITY_TTL_SECONDS * 1000,
      'advisor-gateway': ADVISOR_GATEWAY_IDENTITY_TTL_SECONDS * 1000,
    },
  };
}

function runtimeIdentityPolicy(): RuntimeIdentityPolicy {
  const configDir = process.env.RUNTIME_CONFIG_DIR;
  if (!configDir) return defaultIdentityPolicy();
  const file = path.join(configDir, 'security-contract.v1.json');
  try {
    const stat = statSync(file);
    const fingerprint = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (identityPolicyCache?.fingerprint === fingerprint) return identityPolicyCache.policy;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      identity?: RuntimeIdentityPolicy;
    };
    if (!parsed.identity) return defaultIdentityPolicy();
    identityPolicyCache = { fingerprint, policy: parsed.identity };
    return parsed.identity;
  } catch {
    return identityPolicyCache?.policy ?? defaultIdentityPolicy();
  }
}

export function futureEngineIdentityHeader(): string {
  return runtimeIdentityPolicy().trustedHeader;
}

export function advisorGatewayIdentityHeader(): string {
  return runtimeIdentityPolicy().advisorTrustedHeader;
}

export interface FutureEngineIdentityAssertionOptions {
  principalId: string;
  secret: string;
  scope: 'mcp' | 'life-api';
  now?: number | Date;
  ttlSeconds?: number;
  jti?: string;
}

export interface AdvisorGatewayIdentityAssertionOptions {
  principalId: string;
  conversationId: string;
  turnId: string;
  userMessageId: string;
  secret: string;
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
  ttlSeconds,
  jti = randomUUID(),
}: FutureEngineIdentityAssertionOptions): string {
  const signingSecret = requireSecret(secret);
  const sub = requirePrincipal(principalId);
  const policy = runtimeIdentityPolicy();
  const activeTtlSeconds = ttlSeconds ?? Math.floor(policy.maxTtlMsByScope[scope] / 1000);
  if (
    !Number.isInteger(activeTtlSeconds) ||
    activeTtlSeconds < 1 ||
    activeTtlSeconds > Math.floor(policy.maxTtlMsByScope[scope] / 1000)
  ) {
    throw new Error('future-engine identity ttl is invalid');
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(jti)) {
    throw new Error('future-engine identity nonce is invalid');
  }

  const iat = epochSeconds(now);
  const payload = {
    v: 1,
    sub,
    aud: policy.audience,
    scope,
    iat,
    exp: iat + activeTtlSeconds,
    jti,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `v1.${encoded}`;
  const signature = createHmac('sha256', signingSecret).update(message).digest('base64url');
  return `${message}.${signature}`;
}

function requireTurnClaim(value: string, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(normalized)) {
    throw new Error(`advisor gateway ${label} is invalid`);
  }
  return normalized;
}

export function advisorIdForPrincipal(principalId: string): string {
  const principal = requirePrincipal(principalId);
  return `adv_${createHash('sha256').update(`adv:${principal}`).digest('hex').slice(0, 20)}`;
}

export function createAdvisorGatewayIdentityAssertion({
  principalId,
  conversationId,
  turnId,
  userMessageId,
  secret,
  now = Date.now(),
  ttlSeconds,
  jti = randomUUID(),
}: AdvisorGatewayIdentityAssertionOptions): string {
  const signingSecret = requireSecret(secret);
  const sub = requirePrincipal(principalId);
  const policy = runtimeIdentityPolicy();
  const maxTtlSeconds = Math.floor(policy.maxTtlMsByScope['advisor-gateway'] / 1000);
  const activeTtlSeconds = ttlSeconds ?? maxTtlSeconds;
  if (
    !Number.isInteger(activeTtlSeconds) ||
    activeTtlSeconds < 1 ||
    activeTtlSeconds > maxTtlSeconds
  ) {
    throw new Error('advisor gateway identity ttl is invalid');
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(jti)) {
    throw new Error('advisor gateway identity nonce is invalid');
  }
  const iat = epochSeconds(now);
  const payload = {
    v: 1,
    sub,
    aud: policy.audience,
    scope: 'advisor-gateway',
    iat,
    exp: iat + activeTtlSeconds,
    jti,
    advisorId: advisorIdForPrincipal(sub),
    conversationId: requireTurnClaim(conversationId, 'conversationId'),
    turnId: requireTurnClaim(turnId, 'turnId'),
    userMessageId: requireTurnClaim(userMessageId, 'userMessageId'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `v1.${encoded}`;
  const signature = createHmac('sha256', signingSecret).update(message).digest('base64url');
  return `${message}.${signature}`;
}
