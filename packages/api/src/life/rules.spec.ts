import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { listRulesBackups } from './rules';

describe('listRulesBackups', () => {
  it('认得出真实回滚点 ID（ISO 时间戳 + UUID），否则页面上根本看不到回滚按钮', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rules-backups-'));
    const backupsDir = path.join(dir, '.rules-backups');
    const ids = [
      '2026-07-29T15-25-46-319Z-8548e4aa-c13c-41cc-91af-18bcaf58003e',
      '2026-07-29T15-27-48-791Z-b974ec04-1daf-43c1-8aee-76dc06ad83cd',
    ];
    for (const id of ids) {
      await mkdir(path.join(backupsDir, id), { recursive: true });
      await writeFile(path.join(backupsDir, id, 'rules.v1.json'), '{}');
    }
    await mkdir(path.join(backupsDir, 'not-a-backup'), { recursive: true });

    const backups = await listRulesBackups(dir);
    expect(backups.map((item) => item.rollbackId)).toEqual([ids[1], ids[0]]);
    expect(backups[0].at).toBe('2026-07-29 15:27:48');
  });

  it('没有回滚点目录时返回空列表而不是抛错', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'rules-empty-'));
    await expect(listRulesBackups(dir)).resolves.toEqual([]);
  });
});
