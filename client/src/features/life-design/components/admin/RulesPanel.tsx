import { useEffect, useMemo, useState } from 'react';
import { request } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type RuleKind = 'forbid_any' | 'require_any' | 'count_limit' | 'quote_verbatim' | 'number_source';

type Rule = {
  id: string;
  code?: string;
  status: 'published' | 'draft';
  severity: 'M' | 'S';
  targets: string[];
  kind: RuleKind;
  params: Record<string, unknown>;
  action: 'observe' | 'reject';
  note?: string;
};

type RulesDocument = {
  schemaVersion: number;
  configurationVersion: string;
  sha256: string;
  rules: Rule[];
  [field: string]: unknown;
};

type Backup = { rollbackId: string; at: string };

const KIND_LABELS: Record<RuleKind, string> = {
  forbid_any: '命中即违规',
  require_any: '缺失即违规',
  count_limit: '数量上限',
  quote_verbatim: '引用必须逐字',
  number_source: '数字必须有来源',
};

const BLANK_RULE = `{
  "id": "new-rule",
  "status": "draft",
  "severity": "S",
  "targets": ["chat.reply"],
  "kind": "forbid_any",
  "params": { "terms": ["写死的话"], "patterns": [] },
  "action": "observe",
  "note": "为什么有这条规矩"
}`;

const summaryOf = (rule: Rule): string => {
  const params = rule.params || {};
  if (rule.kind === 'forbid_any' || rule.kind === 'require_any') {
    const terms = Array.isArray(params.terms) ? params.terms.length : 0;
    const patterns = Array.isArray(params.patterns) ? params.patterns.length : 0;
    return `${terms} 个词 · ${patterns} 条正则`;
  }
  if (rule.kind === 'count_limit') {
    return `${params.what} ≤ ${params.max}`;
  }
  if (rule.kind === 'number_source') {
    return `≥ ${params.minDigits} 位数字`;
  }
  return String(params.pattern ?? '');
};

export default function RulesPanel() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [addition, setAddition] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const rules = useQuery<RulesDocument>(['lifeAdminRules'], () =>
    request.get<RulesDocument>('/api/life/admin/rules'),
  );
  const backups = useQuery<{ backups: Backup[] }>(['lifeAdminRulesBackups'], () =>
    request.get<{ backups: Backup[] }>('/api/life/admin/rules/backups'),
  );

  useEffect(() => {
    if (rules.data && !draft) {
      // 草稿必须带上文件里的全部顶层字段(reason/updatedAt 等)，
      // 只挑几个键会在保存时把配置改瘦，SHA 也就再也回不到原值。
      const { sha256: _serverSha, ...document } = rules.data;
      setDraft(JSON.stringify(document, null, 2));
    }
  }, [rules.data, draft]);

  const save = useMutation<{ sha256: string; ruleCount: number }, Error, string>(
    (value) => request.put('/api/life/admin/rules', JSON.parse(value)),
    {
      onSuccess: (result) => {
        setNotice(`已生效：${result.ruleCount} 条规矩，SHA ${result.sha256.slice(0, 12)}`);
        queryClient.invalidateQueries(['lifeAdminRules']);
        queryClient.invalidateQueries(['lifeAdminRulesBackups']);
      },
      onError: (error) => setNotice(`没有保存：${error.message}`),
    },
  );

  const rollback = useMutation<{ sha256: string }, Error, string>(
    (rollbackId) => request.post('/api/life/admin/rules/rollback', { rollbackId }),
    {
      onSuccess: () => {
        setNotice('已回滚到所选版本');
        setDraft('');
        queryClient.invalidateQueries(['lifeAdminRules']);
        queryClient.invalidateQueries(['lifeAdminRulesBackups']);
      },
      onError: (error) => setNotice(`回滚失败：${error.message}`),
    },
  );

  const parsed = useMemo(() => {
    if (!draft) return { ok: true as const, count: rules.data?.rules.length ?? 0 };
    try {
      const value = JSON.parse(draft);
      if (!Array.isArray(value?.rules)) throw new Error('rules 必须是数组');
      return { ok: true as const, count: value.rules.length };
    } catch (error) {
      return { ok: false as const, message: (error as Error).message };
    }
  }, [draft, rules.data]);

  const appendRule = () => {
    try {
      const value = JSON.parse(
        draft || '{"schemaVersion":1,"configurationVersion":"v1","rules":[]}',
      );
      value.rules = [...(value.rules || []), JSON.parse(addition || BLANK_RULE)];
      setDraft(JSON.stringify(value, null, 2));
      setAddition('');
      setNotice('已加到草稿，确认后点保存才会生效');
    } catch (error) {
      setNotice(`加不进去：${(error as Error).message}`);
    }
  };

  if (rules.isLoading) {
    return <p className="text-life-sm text-text-secondary">读取中…</p>;
  }
  if (!rules.data) {
    return (
      <p role="alert" className="text-life-sm text-red-600">
        规矩表读取失败：{(rules.error as Error | undefined)?.message || '稍后再试'}
      </p>
    );
  }

  return (
    <section>
      <p className="mb-3 text-life-meta text-text-secondary">
        这里就是运行中的规矩本身。改完保存，引擎下一个回合就按新规矩走，不重启、不发版。
        保存前先过引擎校验，不合格存不进去；每次保存都留一个回滚点。
      </p>

      {notice && (
        <p
          role="status"
          className={`mb-3 text-life-sm ${save.isError || rollback.isError ? 'text-red-600' : 'text-life-moss'}`}
        >
          {notice}
        </p>
      )}

      <div className="mb-4 overflow-x-auto rounded-2xl border border-border-light">
        <table className="w-full text-left text-life-sm">
          <thead className="bg-surface-secondary text-life-meta text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 font-medium">规矩</th>
              <th className="px-4 py-2.5 font-medium">管哪些</th>
              <th className="px-4 py-2.5 font-medium">判断</th>
              <th className="px-4 py-2.5 font-medium">内容</th>
              <th className="px-4 py-2.5 font-medium">违规时</th>
            </tr>
          </thead>
          <tbody>
            {rules.data.rules.map((item) => (
              <tr key={item.id} className="border-t border-border-light">
                <td className="px-4 py-2.5">
                  <p className="font-mono text-text-primary">{item.id}</p>
                  <p className="text-life-meta text-text-secondary">
                    {item.severity} 级{item.status === 'draft' ? ' · 草稿未生效' : ''}
                    {item.note ? ` · ${item.note}` : ''}
                  </p>
                </td>
                <td className="px-4 py-2.5 font-mono text-life-meta">{item.targets.join('、')}</td>
                <td className="px-4 py-2.5">{KIND_LABELS[item.kind]}</td>
                <td className="px-4 py-2.5 font-mono text-life-meta">{summaryOf(item)}</td>
                <td
                  className={
                    item.action === 'reject'
                      ? 'px-4 py-2.5 text-life-cinnabar'
                      : 'px-4 py-2.5 text-text-secondary'
                  }
                >
                  {item.action === 'reject' ? '拦下不落库' : '只记账'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-4 rounded-2xl border border-border-light bg-surface-primary p-4">
        <p className="mb-2 text-life-sm font-medium text-text-primary">加一条规矩</p>
        <textarea
          value={addition}
          onChange={(event) => setAddition(event.target.value)}
          placeholder={BLANK_RULE}
          rows={6}
          spellCheck={false}
          className="w-full rounded-xl border border-border-light bg-surface-secondary p-3 font-mono text-life-meta"
        />
        <button
          type="button"
          onClick={appendRule}
          className="mt-2 rounded-full border border-border-light px-4 py-1.5 text-life-sm hover:text-text-primary"
        >
          加到草稿
        </button>
      </div>

      <label
        htmlFor="rules-draft"
        className="mb-2 block text-life-sm font-medium text-text-primary"
      >
        全文编辑（删一条就删掉对应那段）
      </label>
      <textarea
        id="rules-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={18}
        spellCheck={false}
        className="w-full rounded-2xl border border-border-light bg-surface-secondary p-3 font-mono text-life-meta"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!parsed.ok || save.isLoading}
          onClick={() => save.mutate(draft)}
          className="rounded-full bg-life-moss px-5 py-2 text-life-sm text-white disabled:opacity-50"
        >
          {save.isLoading ? '保存中…' : '保存并生效'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft('');
            setNotice(null);
            queryClient.invalidateQueries(['lifeAdminRules']);
          }}
          className="rounded-full border border-border-light px-4 py-2 text-life-sm text-text-secondary"
        >
          放弃改动
        </button>
        <span className="text-life-meta text-text-secondary">
          {parsed.ok
            ? `${parsed.count} 条规矩 · 当前 SHA ${rules.data.sha256.slice(0, 12)}`
            : `JSON 有问题：${parsed.message}`}
        </span>
      </div>

      {(backups.data?.backups.length ?? 0) > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-life-sm font-medium text-text-primary">回滚点</p>
          <ul className="space-y-1">
            {backups.data?.backups.slice(0, 8).map((item) => (
              <li key={item.rollbackId} className="flex items-center gap-3 text-life-meta">
                <span className="font-mono text-text-secondary">{item.at}</span>
                <button
                  type="button"
                  disabled={rollback.isLoading}
                  onClick={() => rollback.mutate(item.rollbackId)}
                  className="rounded-full border border-border-light px-3 py-1 hover:text-text-primary disabled:opacity-50"
                >
                  回滚到这一版
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
