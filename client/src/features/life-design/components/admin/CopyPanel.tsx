import { useMemo, useState } from 'react';
import { request } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@librechat/client';
import defaults from '~/locales/en/translation.json';

type OverrideRow = { key: string; value: string; updatedAt?: string };

/** 界面文案(com_life_*)的"广告位":改哪句搜哪句,存后刷新页面全站生效。 */
const LIFE_KEYS = Object.keys(defaults).filter((key) => key.startsWith('com_life_'));

export default function CopyPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const [draft, setDraft] = useState('');

  const overridesQuery = useQuery<{ overrides: OverrideRow[] }>(['lifeAdminCopy'], () =>
    request.get('/api/life/admin/copy'),
  );
  const save = useMutation<unknown, Error, { key: string; value: string }>(
    (body) => request.put('/api/life/admin/copy', body),
    {
      onSuccess: () => {
        setEditingKey('');
        queryClient.invalidateQueries(['lifeAdminCopy']);
      },
    },
  );

  const overrideByKey = useMemo(
    () => new Map((overridesQuery.data?.overrides ?? []).map((row) => [row.key, row.value])),
    [overridesQuery.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = term
      ? LIFE_KEYS.filter((key) => {
          const current = overrideByKey.get(key) ?? (defaults as Record<string, string>)[key];
          return key.toLowerCase().includes(term) || current.toLowerCase().includes(term);
        })
      : LIFE_KEYS;
    return matched.slice(0, 50);
  }, [search, overrideByKey]);

  const startEdit = (key: string) => {
    setEditingKey(key);
    setDraft(overrideByKey.get(key) ?? (defaults as Record<string, string>)[key]);
  };

  return (
    <section>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="搜文案内容或 key,比如:一团雾"
        className="mb-1 h-11 w-full rounded-xl border border-border-light bg-surface-secondary px-4 text-life-sm text-text-primary outline-none focus:border-life-moss"
      />
      <p className="mb-4 text-life-meta text-text-secondary">
        共 {LIFE_KEYS.length} 条界面文案,最多显示 50 条。保存后刷新页面全站生效;清空内容保存 =
        恢复默认。AI 开场白与报告文案不在这里(在服务端配置)。
      </p>
      {save.isError && (
        <p role="alert" className="mb-2 text-life-sm text-red-600">
          保存失败:{save.error?.message || '稍后再试'}
        </p>
      )}
      <ul className="divide-y divide-border-light">
        {rows.map((key) => {
          const overridden = overrideByKey.has(key);
          const current = overrideByKey.get(key) ?? (defaults as Record<string, string>)[key];
          const editing = editingKey === key;
          return (
            <li key={key} className="py-3">
              <div className="mb-1 flex items-center gap-2">
                <code className="font-mono text-life-meta text-text-secondary">{key}</code>
                {overridden && (
                  <span className="rounded bg-life-cinnabar/10 px-1.5 py-0.5 text-life-meta text-life-cinnabar">
                    已覆盖
                  </span>
                )}
              </div>
              {editing ? (
                <div>
                  <textarea
                    value={draft}
                    rows={3}
                    onChange={(event) => setDraft(event.target.value)}
                    className="w-full rounded-xl border border-life-moss bg-surface-primary p-3 text-life-sm text-text-primary outline-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      disabled={save.isLoading}
                      onClick={() => save.mutate({ key, value: draft })}
                      className="rounded-lg bg-life-moss text-life-paper hover:bg-life-moss-deep"
                    >
                      {save.isLoading ? '保存中…' : '保存'}
                    </Button>
                    {overridden && (
                      <Button
                        type="button"
                        disabled={save.isLoading}
                        onClick={() => save.mutate({ key, value: '' })}
                        className="rounded-lg bg-surface-secondary text-text-primary"
                      >
                        恢复默认
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setEditingKey('')}
                      className="rounded-lg bg-surface-secondary text-text-secondary"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(key)}
                  className="block w-full rounded-lg p-1 text-left text-life-sm leading-6 text-text-primary hover:bg-surface-secondary"
                  title="点击编辑"
                >
                  {current}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
