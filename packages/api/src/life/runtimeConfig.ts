import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { appendFile, chmod, copyFile, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { LifeEngineClient } from './client';

const POLICY_FILES = {
  runtime: 'runtime-policy.v1.json',
  security_contract: 'security-contract.v1.json',
  product_catalog: 'product-catalog.v1.json',
} as const;

export type RuntimeConfigKind = keyof typeof POLICY_FILES;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface PolicyDocument extends JsonObject {
  schemaVersion: number;
  policyVersion: string;
  updatedAt: string;
  reason: string;
}

export interface ProductCatalogDocument extends JsonObject {
  schemaVersion: number;
  catalogVersion: string;
  updatedAt: string;
  reason: string;
  activeProductId: string;
  products: JsonValue[];
}

export type RuntimeConfigDocument = PolicyDocument | ProductCatalogDocument;

export interface PolicyBundle {
  runtime: PolicyDocument;
  security: PolicyDocument;
  productCatalog: ProductCatalogDocument;
}

export interface RuntimeApiPolicy {
  operationLeaseMs: number;
  operationPollIntervalMs: number;
  operationPollAttempts: number;
  resumeReplayWindowMs: number;
}

export interface RuntimeSecurityContracts {
  stanceSelections: string[];
  stanceLevels: string[];
  lifeVisitModes: string[];
  houseIds: string[];
  operationIdPattern: string;
  scenarioIdPattern: string;
  policyVersionPattern: string;
}

let runtimeApiPolicyCache: { fingerprint: string; value: RuntimeApiPolicy } | null = null;
let securityContractsCache: { fingerprint: string; value: RuntimeSecurityContracts } | null = null;

export function runtimeApiPolicy(
  configDir: string | undefined = process.env.RUNTIME_CONFIG_DIR,
): RuntimeApiPolicy {
  const fallback = {
    operationLeaseMs: 15_000,
    operationPollIntervalMs: 250,
    operationPollAttempts: 10,
    resumeReplayWindowMs: 600_000,
  };
  if (!configDir) return fallback;
  const file = path.join(configDir, POLICY_FILES.runtime);
  try {
    const stat = statSync(file);
    const fingerprint = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (runtimeApiPolicyCache?.fingerprint === fingerprint) return runtimeApiPolicyCache.value;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { api?: RuntimeApiPolicy };
    if (!parsed.api) return fallback;
    runtimeApiPolicyCache = { fingerprint, value: parsed.api };
    return parsed.api;
  } catch {
    return runtimeApiPolicyCache?.value ?? fallback;
  }
}

export function runtimeSecurityContracts(
  configDir: string | undefined = process.env.RUNTIME_CONFIG_DIR,
): RuntimeSecurityContracts {
  const fallback = {
    stanceSelections: ['more_direct', 'just_right', 'less_direct'],
    stanceLevels: ['restrained', 'direct', 'decisive'],
    lifeVisitModes: ['first_entry', 'return_entry', 'continue'],
    houseIds: Array.from({ length: 12 }, (_, index) => `h${index + 1}`),
    operationIdPattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    scenarioIdPattern: '^(?=.{2,64}$)[a-z][a-z0-9]*(?:_[a-z0-9]+)*$',
    policyVersionPattern: '^[a-z0-9-]{1,64}$',
  };
  if (!configDir) return fallback;
  const file = path.join(configDir, POLICY_FILES.security_contract);
  try {
    const stat = statSync(file);
    const fingerprint = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (securityContractsCache?.fingerprint === fingerprint) return securityContractsCache.value;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      contracts?: RuntimeSecurityContracts;
    };
    if (!parsed.contracts) return fallback;
    securityContractsCache = { fingerprint, value: parsed.contracts };
    return parsed.contracts;
  } catch {
    return securityContractsCache?.value ?? fallback;
  }
}

interface ValidationResult {
  schemaVersion: 1;
  valid: true;
  restartRequired: boolean;
  runtime: { policyVersion: string; sha256: string };
  security: { policyVersion: string; sha256: string };
  productCatalog: {
    catalogVersion: string;
    sha256: string;
    productId: string;
    snapshotSha256: string;
  };
}

interface RuntimeConfigSummary {
  schemaVersion: 1;
  policy: {
    runtime: { policyVersion: string; sha256: string };
    security: { policyVersion: string; sha256: string };
    productCatalog: {
      catalogVersion: string;
      sha256: string;
      productId: string;
      snapshotSha256: string;
    };
  };
  restartRequired: boolean;
}

export interface ApplyRuntimeConfigOptions {
  configDir: string;
  kind: RuntimeConfigKind;
  document: RuntimeConfigDocument;
  actorId: string;
  engine: LifeEngineClient;
  now?: Date;
}

export interface ApplyRuntimeConfigResult {
  applied: true;
  kind: RuntimeConfigKind;
  rollbackId: string;
  oldSha256: string;
  newSha256: string;
  policyVersion: string;
  restartRequired: boolean;
}

function policyPath(configDir: string, kind: RuntimeConfigKind): string {
  return path.join(configDir, POLICY_FILES[kind]);
}

function serialize(value: RuntimeConfigDocument): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertPolicyDocument(value: JsonValue, label: string): asserts value is PolicyDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (
    typeof value.schemaVersion !== 'number' ||
    typeof value.policyVersion !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.reason !== 'string' ||
    value.reason.trim().length === 0
  ) {
    throw new Error(`${label} metadata is invalid`);
  }
}

async function readPolicy(file: string, label: string): Promise<PolicyDocument> {
  const parsed = JSON.parse(await readFile(file, 'utf8')) as JsonValue;
  assertPolicyDocument(parsed, label);
  return parsed;
}

function assertProductCatalogDocument(
  value: JsonValue,
  label: string,
): asserts value is ProductCatalogDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (
    typeof value.schemaVersion !== 'number' ||
    typeof value.catalogVersion !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.reason !== 'string' ||
    value.reason.trim().length === 0 ||
    typeof value.activeProductId !== 'string' ||
    !Array.isArray(value.products)
  ) {
    throw new Error(`${label} metadata is invalid`);
  }
}

async function readProductCatalog(file: string, label: string): Promise<ProductCatalogDocument> {
  const parsed = JSON.parse(await readFile(file, 'utf8')) as JsonValue;
  assertProductCatalogDocument(parsed, label);
  return parsed;
}

function assertRuntimeConfigDocument(
  kind: RuntimeConfigKind,
  value: JsonValue,
  label: string,
): asserts value is RuntimeConfigDocument {
  if (kind === 'product_catalog') {
    assertProductCatalogDocument(value, label);
    return;
  }
  assertPolicyDocument(value, label);
}

export async function readPolicyBundle(configDir: string): Promise<PolicyBundle> {
  const [runtime, security, productCatalog] = await Promise.all([
    readPolicy(policyPath(configDir, 'runtime'), 'runtime policy'),
    readPolicy(policyPath(configDir, 'security_contract'), 'security contract'),
    readProductCatalog(policyPath(configDir, 'product_catalog'), 'product catalog'),
  ]);
  return { runtime, security, productCatalog };
}

function redactedBundle(bundle: PolicyBundle): PolicyBundle {
  const copy = structuredClone(bundle);
  const reveal = copy.runtime.reveal;
  if (reveal && typeof reveal === 'object' && !Array.isArray(reveal)) {
    const allowlist = reveal.allowlistUserIds;
    reveal.allowlistUserIds = Array.isArray(allowlist) ? [`[redacted:${allowlist.length}]`] : [];
    const patterns = reveal.sensitiveEvidencePatterns;
    if (patterns && typeof patterns === 'object' && !Array.isArray(patterns)) {
      reveal.sensitiveEvidencePatterns = Object.fromEntries(
        Object.keys(patterns).map((key) => [key, '[redacted]']),
      );
    }
  }
  return copy;
}

export async function readRedactedPolicyBundle(configDir: string): Promise<PolicyBundle> {
  return redactedBundle(await readPolicyBundle(configDir));
}

async function atomicWrite(file: string, value: string): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const descriptor = await open(temporary, 'wx', 0o600);
  try {
    await descriptor.writeFile(value, 'utf8');
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
  await rename(temporary, file);
  await chmod(file, 0o600);
}

async function appendAudit(configDir: string, event: JsonObject): Promise<void> {
  const auditDir = path.join(configDir, '.audit');
  await mkdir(auditDir, { recursive: true, mode: 0o700 });
  await appendFile(path.join(auditDir, 'runtime-config.jsonl'), `${JSON.stringify(event)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function backupBundle(configDir: string, rollbackId: string): Promise<string> {
  const backupDir = path.join(configDir, '.backups', rollbackId);
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  await Promise.all(
    Object.values(POLICY_FILES).map((file) =>
      copyFile(path.join(configDir, file), path.join(backupDir, file)),
    ),
  );
  return backupDir;
}

async function restoreBundle(configDir: string, backupDir: string): Promise<void> {
  for (const file of Object.values(POLICY_FILES)) {
    const content = await readFile(path.join(backupDir, file), 'utf8');
    await atomicWrite(path.join(configDir, file), content);
  }
}

function proposedBundle(
  bundle: PolicyBundle,
  kind: RuntimeConfigKind,
  document: RuntimeConfigDocument,
): PolicyBundle {
  if (kind === 'runtime') return { ...bundle, runtime: document as PolicyDocument };
  if (kind === 'security_contract') return { ...bundle, security: document as PolicyDocument };
  return { ...bundle, productCatalog: document as ProductCatalogDocument };
}

function documentForKind(bundle: PolicyBundle, kind: RuntimeConfigKind): RuntimeConfigDocument {
  if (kind === 'runtime') return bundle.runtime;
  if (kind === 'security_contract') return bundle.security;
  return bundle.productCatalog;
}

function versionForKind(kind: RuntimeConfigKind, document: RuntimeConfigDocument): string {
  return kind === 'product_catalog'
    ? (document as ProductCatalogDocument).catalogVersion
    : (document as PolicyDocument).policyVersion;
}

function validationForKind(validation: ValidationResult, kind: RuntimeConfigKind) {
  if (kind === 'runtime') return validation.runtime;
  if (kind === 'security_contract') return validation.security;
  return validation.productCatalog;
}

export async function applyRuntimeConfig({
  configDir,
  kind,
  document,
  actorId,
  engine,
  now = new Date(),
}: ApplyRuntimeConfigOptions): Promise<ApplyRuntimeConfigResult> {
  const at = now.toISOString();
  const actor = String(actorId || '').slice(0, 128);
  assertRuntimeConfigDocument(kind, document, `${kind} document`);
  const current = await readPolicyBundle(configDir);
  const proposed = proposedBundle(current, kind, document);
  const validation = await engine.json<ValidationResult>('/internal/runtime-config/validate', {
    method: 'POST',
    body: proposed,
  });
  const oldDocument = documentForKind(current, kind);
  const oldSha256 = sha256(serialize(oldDocument));
  const expected = validationForKind(validation, kind);
  if (oldSha256 === expected.sha256) throw new Error('runtime config has no effective change');

  const rollbackId = `${at.replace(/[:.]/g, '-')}-${randomUUID()}`;
  const backupDir = await backupBundle(configDir, rollbackId);
  const file = policyPath(configDir, kind);
  try {
    await atomicWrite(file, serialize(document));
    await engine.json('/internal/runtime-config/reload', {
      method: 'POST',
      body: {
        runtimeSha256: validation.runtime.sha256,
        securitySha256: validation.security.sha256,
        productCatalogSha256: validation.productCatalog.sha256,
      },
    });
    const summary = await engine.json<RuntimeConfigSummary>('/internal/runtime-config');
    if (
      summary.policy.runtime.sha256 !== validation.runtime.sha256 ||
      summary.policy.security.sha256 !== validation.security.sha256 ||
      summary.policy.productCatalog.sha256 !== validation.productCatalog.sha256
    ) {
      throw new Error('runtime config health verification failed');
    }
    await appendAudit(configDir, {
      at,
      actor,
      kind,
      result: 'applied',
      rollbackId,
      oldSha256,
      newSha256: expected.sha256,
      policyVersion: versionForKind(kind, document),
      restartRequired: validation.restartRequired,
    });
    return {
      applied: true,
      kind,
      rollbackId,
      oldSha256,
      newSha256: expected.sha256,
      policyVersion: versionForKind(kind, document),
      restartRequired: validation.restartRequired,
    };
  } catch (error) {
    await restoreBundle(configDir, backupDir);
    const restored = await readPolicyBundle(configDir);
    await engine.json('/internal/runtime-config/reload', {
      method: 'POST',
      body: {
        runtimeSha256: sha256(serialize(restored.runtime)),
        securitySha256: sha256(serialize(restored.security)),
        productCatalogSha256: sha256(serialize(restored.productCatalog)),
      },
    });
    await appendAudit(configDir, {
      at,
      actor,
      kind,
      result: 'rolled_back',
      rollbackId,
      oldSha256,
      attemptedSha256: expected.sha256,
      error: error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
    });
    throw error;
  } finally {
    await rm(path.join(configDir, '.pending'), { recursive: true, force: true });
  }
}
