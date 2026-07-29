import { createHash, randomUUID } from 'node:crypto';
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
} from 'node:fs/promises';
import path from 'node:path';

import type { JsonObject, JsonValue } from './runtimeConfig';

export const RULES_FILE = 'rules.v1.json';

export interface RulesDocument extends JsonObject {
  schemaVersion: number;
  configurationVersion: string;
  rules: JsonValue[];
}

export interface RulesEngineClient {
  json<T extends object>(
    path: string,
    options?: { method?: 'GET' | 'POST'; body?: object },
  ): Promise<T>;
}

export interface ApplyRulesOptions {
  configDir: string;
  document: JsonValue;
  actorId: string;
  engine: RulesEngineClient;
  now?: Date;
}

export interface ApplyRulesResult {
  sha256: string;
  configurationVersion: string;
  ruleCount: number;
  rollbackId: string;
  appliedAt: string;
}

export interface RulesBackup {
  rollbackId: string;
  at: string;
}

function serialize(document: JsonValue): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rulesPath(configDir: string): string {
  return path.join(configDir, RULES_FILE);
}

function assertRulesDocument(value: JsonValue): asserts value is RulesDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('规矩表必须是对象');
  }
  const document = value as JsonObject;
  if (document.schemaVersion !== 1) {
    throw new Error('规矩表 schemaVersion 必须为 1');
  }
  if (typeof document.configurationVersion !== 'string' || !document.configurationVersion.length) {
    throw new Error('规矩表 configurationVersion 必须是非空字符串');
  }
  if (!Array.isArray(document.rules)) {
    throw new Error('规矩表 rules 必须是数组');
  }
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
  await appendFile(path.join(auditDir, 'rules.jsonl'), `${JSON.stringify(event)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function readRulesDocument(configDir: string): Promise<RulesDocument> {
  const raw = await readFile(rulesPath(configDir), 'utf8');
  const parsed = JSON.parse(raw) as JsonValue;
  assertRulesDocument(parsed);
  return parsed;
}

export async function listRulesBackups(configDir: string): Promise<RulesBackup[]> {
  const backupsDir = path.join(configDir, '.rules-backups');
  let entries: string[];
  try {
    entries = await readdir(backupsDir);
  } catch {
    return [];
  }
  // 回滚点 ID = ISO 时间戳(含大写 T/Z) + UUID;正则必须覆盖全字符集,
  // 否则列表恒为空、页面上根本看不到回滚按钮。
  return entries
    .filter((entry) => /^\d{4}-\d{2}-\d{2}T[\dA-Za-z-]{10,}$/.test(entry))
    .sort()
    .reverse()
    .map((rollbackId) => ({
      rollbackId,
      at: rollbackId.slice(0, 19).replace(/T(\d{2})-(\d{2})-(\d{2})$/, ' $1:$2:$3'),
    }));
}

/**
 * 保存规矩表：先让引擎按同一套 schema 校验（不合格根本不落盘），
 * 再备份当前版本、原子写入，最后要求引擎 reload 并核对 SHA。
 * 任一步失败都不改变运行中的规则。
 */
export async function applyRulesConfig({
  configDir,
  document,
  actorId,
  engine,
  now = new Date(),
}: ApplyRulesOptions): Promise<ApplyRulesResult> {
  assertRulesDocument(document);
  const at = now.toISOString();
  const actor = String(actorId || '').slice(0, 128);
  const serialized = serialize(document);
  const nextSha = sha256(serialized);

  const validation = await engine.json<{ valid: boolean; sha256: string; ruleCount: number }>(
    '/internal/rules/validate',
    { method: 'POST', body: document as object },
  );
  if (!validation?.valid) {
    throw new Error('规矩表未通过引擎校验');
  }

  const currentRaw = await readFile(rulesPath(configDir), 'utf8').catch(() => '');
  if (currentRaw && sha256(currentRaw) === nextSha) {
    throw new Error('规矩表没有实际变化');
  }

  const rollbackId = `${at.replace(/[:.]/g, '-')}-${randomUUID()}`;
  if (currentRaw) {
    const backupDir = path.join(configDir, '.rules-backups', rollbackId);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await copyFile(rulesPath(configDir), path.join(backupDir, RULES_FILE));
  }

  await atomicWrite(rulesPath(configDir), serialized);
  try {
    await engine.json('/internal/runtime-config/reload', {
      method: 'POST',
      body: { rulesSha256: nextSha },
    });
  } catch (error) {
    if (currentRaw) {
      await atomicWrite(rulesPath(configDir), currentRaw);
    }
    throw error;
  }

  await appendAudit(configDir, {
    at,
    actorId: actor,
    action: 'rules.apply',
    rollbackId,
    sha256: nextSha,
    ruleCount: validation.ruleCount,
  });

  return {
    sha256: nextSha,
    configurationVersion: (document as RulesDocument).configurationVersion,
    ruleCount: validation.ruleCount,
    rollbackId,
    appliedAt: at,
  };
}

export interface RestoreRulesOptions {
  configDir: string;
  rollbackId: string;
  actorId: string;
  engine: RulesEngineClient;
  now?: Date;
}

export async function restoreRulesBackup({
  configDir,
  rollbackId,
  actorId,
  engine,
  now = new Date(),
}: RestoreRulesOptions): Promise<ApplyRulesResult> {
  if (!/^[0-9A-Za-z:.-]{20,200}$/.test(rollbackId)) {
    throw new Error('回滚点标识不合法');
  }
  const backupFile = path.join(configDir, '.rules-backups', rollbackId, RULES_FILE);
  const raw = await readFile(backupFile, 'utf8');
  const parsed = JSON.parse(raw) as JsonValue;
  return applyRulesConfig({ configDir, document: parsed, actorId, engine, now });
}
