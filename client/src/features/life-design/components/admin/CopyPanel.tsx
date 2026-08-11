import { useCallback, useMemo, useState } from 'react';
import { request } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@librechat/client';
import defaults from '~/locales/en/translation.json';

type OverrideRow = { key: string; value: string; updatedAt?: string };

const defaultsMap = defaults as Record<string, string>;

/** 精选:人常改的文案,按位置分组、给人话标签。其余几百条走底部"全部(搜索)"。 */
const CURATED: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: '首页(未登录落地页)',
    items: [
      { key: 'com_life_public_kicker', label: '小字(标题上一句)' },
      { key: 'com_life_public_title', label: '大标题' },
      { key: 'com_life_public_description', label: '副标题' },
      { key: 'com_life_start_first', label: '主按钮(开始20分钟梳理)' },
      { key: 'com_life_login_archive', label: '次按钮(登录已有存档)' },
      { key: 'com_life_public_map_kicker', label: '迷雾图·小字' },
      { key: 'com_life_public_map_aria', label: '迷雾图·无障碍说明' },
      { key: 'com_life_public_private', label: '隐私承诺' },
    ],
  },
  {
    group: '左侧导航',
    items: [
      { key: 'com_life_nav_home', label: '首页' },
      { key: 'com_life_nav_resume', label: '继续聊' },
      { key: 'com_life_nav_archive', label: '人生存档' },
      { key: 'com_life_nav_admin', label: '运营台(仅你可见)' },
    ],
  },
  {
    group: '建档(第一步·选一条路)',
    items: [
      { key: 'com_life_setup_eyebrow', label: '小字' },
      { key: 'com_life_setup_title', label: '标题' },
      { key: 'com_life_setup_description', label: '说明' },
      { key: 'com_life_archive_name', label: '存档名·标签' },
      { key: 'com_life_archive_name_help', label: '存档名·提示' },
      { key: 'com_life_choose_house', label: '选域·标题' },
      { key: 'com_life_choose_house_help', label: '选域·说明' },
      { key: 'com_life_enter_studio', label: '进入工作室按钮' },
    ],
  },
  {
    group: '存档页',
    items: [
      { key: 'com_life_my_archive', label: '标题' },
      { key: 'com_life_archive_current_meta', label: '当前·小字' },
      { key: 'com_life_archive_ongoing', label: '更新时间句' },
      { key: 'com_life_current_map', label: '现在的我' },
      { key: 'com_life_continue_archive', label: '继续按钮' },
      { key: 'com_life_archive_card', label: '存档卡·标题' },
      { key: 'com_life_archive_card_help', label: '存档卡·说明' },
    ],
  },
  {
    group: '品牌',
    items: [{ key: 'com_life_brand', label: '产品名' }],
  },
];

const CURATED_KEYS = new Set(CURATED.flatMap((g) => g.items.map((i) => i.key)));
const ALL_LIFE_KEYS = Object.keys(defaultsMap).filter((k) => k.startsWith('com_life_'));

export default function CopyPanel() {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState('');
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');

  const overridesQuery = useQuery<{ overrides: OverrideRow[] }>(['lifeAdminCopy'], () =>
    request.get<{ overrides: OverrideRow[] }>('/api/life/admin/copy'),
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

  const currentOf = useCallback(
    (key: string) => overrideByKey.get(key) ?? defaultsMap[key] ?? '',
    [overrideByKey],
  );
  const startEdit = (key: string) => {
    setEditingKey(key);
    setDraft(currentOf(key));
  };

  const allRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = search
      ? ALL_LIFE_KEYS.filter(
          (k) => k.toLowerCase().includes(term) || currentOf(k).toLowerCase().includes(term),
        )
      : ALL_LIFE_KEYS.filter((k) => !CURATED_KEYS.has(k));
    return base.slice(0, 60);
  }, [currentOf, search]);

  const renderRow = (key: string, label?: string) => {
    const overridden = overrideByKey.has(key);
    const current = currentOf(key);
    const editing = editingKey === key;
    return (
      <li key={key} className="py-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-life-sm font-medium text-text-primary">{label ?? key}</span>
          {label && <code className="font-mono text-life-meta text-text-secondary">{key}</code>}
          {overridden && (
            <span className="rounded bg-life-cinnabar/10 px-1.5 py-0.5 text-life-meta text-life-cinnabar">
              已改
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
            {current || <span className="text-text-secondary">（空）</span>}
          </button>
        )}
      </li>
    );
  };

  return (
    <section>
      <p className="mb-5 text-life-meta text-text-secondary">
        改完点保存,刷新页面全站生效;「恢复默认」= 清掉改动回到内置文案。AI
        开场白与报告内文案不在这里(在服务端配置)。
      </p>

      {/* 精选:按位置分组 */}
      {CURATED.map((grp) => (
        <div key={grp.group} className="mb-6">
          <h3 className="font-serif mb-1 border-b border-border-light pb-2 text-life-lead font-semibold text-text-primary">
            {grp.group}
          </h3>
          <ul className="divide-y divide-border-light">
            {grp.items.map((item) => renderRow(item.key, item.label))}
          </ul>
        </div>
      ))}

      {/* 其余全部,折叠 + 搜索 */}
      <div className="mt-8 border-t border-border-light pt-4">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-life-sm font-medium text-life-cinnabar"
        >
          {showAll ? '▾ ' : '▸ '}全部界面文案(共 {ALL_LIFE_KEYS.length} 条,含上面没列的细项)
        </button>
        {showAll && (
          <div className="mt-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜内容或 key,比如:一团雾"
              className="mb-1 h-11 w-full rounded-xl border border-border-light bg-surface-secondary px-4 text-life-sm text-text-primary outline-none focus:border-life-moss"
            />
            <p className="mb-2 text-life-meta text-text-secondary">
              {search ? '搜索全部;' : '只列上面没收录的细项;'}最多显示 60 条。
            </p>
            <ul className="divide-y divide-border-light">{allRows.map((k) => renderRow(k))}</ul>
          </div>
        )}
      </div>
    </section>
  );
}
