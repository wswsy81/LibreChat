import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LifeEngineClient, LifeEngineRequestOptions } from './client';
import { applyRuntimeConfig, readPolicyBundle, readRedactedPolicyBundle } from './runtimeConfig';
import type { JsonObject, PolicyBundle, PolicyDocument } from './runtimeConfig';

function serialize(value: PolicyDocument): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureBundle(): PolicyBundle {
  return {
    runtime: {
      schemaVersion: 1,
      policyVersion: 'runtime-v1',
      updatedAt: '2026-07-27T00:00:00.000Z',
      reason: 'initial',
      reveal: {
        accessMode: 'allowlist',
        allowlistUserIds: ['user-a'],
        sensitiveEvidencePatterns: { sexual_shame: '性欲' },
      },
    },
    security: {
      schemaVersion: 1,
      policyVersion: 'security-v1',
      updatedAt: '2026-07-27T00:00:00.000Z',
      reason: 'initial',
    },
  };
}

async function seedConfig(): Promise<{ configDir: string; bundle: PolicyBundle }> {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'runtime-config-'));
  const bundle = fixtureBundle();
  await mkdir(configDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(configDir, 'runtime-policy.v1.json'), serialize(bundle.runtime)),
    writeFile(path.join(configDir, 'security-contract.v1.json'), serialize(bundle.security)),
  ]);
  return { configDir, bundle };
}

function fakeEngine(configDir: string, failReload = false): LifeEngineClient {
  return {
    async json<T extends object>(
      requestPath: string,
      options: LifeEngineRequestOptions = {},
    ): Promise<T> {
      if (requestPath === '/internal/runtime-config/validate') {
        const bundle = options.body as PolicyBundle;
        return {
          schemaVersion: 1,
          valid: true,
          restartRequired: false,
          runtime: {
            policyVersion: bundle.runtime.policyVersion,
            sha256: sha256(serialize(bundle.runtime)),
          },
          security: {
            policyVersion: bundle.security.policyVersion,
            sha256: sha256(serialize(bundle.security)),
          },
        } as T;
      }
      if (requestPath === '/internal/runtime-config/reload') {
        if (failReload) throw new Error('reload failed');
        return { reloaded: true } as T;
      }
      if (requestPath === '/internal/runtime-config') {
        const bundle = await readPolicyBundle(configDir);
        return {
          schemaVersion: 1,
          restartRequired: false,
          policy: {
            runtime: {
              policyVersion: bundle.runtime.policyVersion,
              sha256: sha256(serialize(bundle.runtime)),
            },
            security: {
              policyVersion: bundle.security.policyVersion,
              sha256: sha256(serialize(bundle.security)),
            },
          },
        } as T;
      }
      throw new Error(`unexpected path: ${requestPath}`);
    },
    async text(): Promise<string> {
      throw new Error('unexpected text request');
    },
  };
}

describe('runtime config management', () => {
  it('redacts allowlist ids and sensitive regex source from admin reads', async () => {
    const { configDir } = await seedConfig();
    const redacted = await readRedactedPolicyBundle(configDir);
    const reveal = redacted.runtime.reveal as JsonObject;
    expect(reveal.allowlistUserIds).toEqual(['[redacted:1]']);
    expect(reveal.sensitiveEvidencePatterns).toEqual({ sexual_shame: '[redacted]' });
  });

  it('validates, backs up, atomically applies, reloads and audits a config change', async () => {
    const { configDir, bundle } = await seedConfig();
    const document = structuredClone(bundle.runtime);
    document.policyVersion = 'runtime-v2';
    document.reason = 'owner changed reveal access';
    (document.reveal as JsonObject).accessMode = 'invite_only';
    const result = await applyRuntimeConfig({
      configDir,
      kind: 'runtime',
      document,
      actorId: 'admin-1',
      engine: fakeEngine(configDir),
    });
    expect(result.policyVersion).toBe('runtime-v2');
    expect((await readPolicyBundle(configDir)).runtime.policyVersion).toBe('runtime-v2');
    const audit = await readFile(path.join(configDir, '.audit', 'runtime-config.jsonl'), 'utf8');
    expect(audit).toContain('"result":"applied"');
    expect(audit).not.toContain('user-a');
  });

  it('restores the previous files when engine reload or health verification fails', async () => {
    const { configDir, bundle } = await seedConfig();
    const document = structuredClone(bundle.runtime);
    document.policyVersion = 'runtime-v2';
    await expect(
      applyRuntimeConfig({
        configDir,
        kind: 'runtime',
        document,
        actorId: 'admin-1',
        engine: fakeEngine(configDir, true),
      }),
    ).rejects.toThrow('reload failed');
    expect((await readPolicyBundle(configDir)).runtime.policyVersion).toBe('runtime-v1');
  });
});
