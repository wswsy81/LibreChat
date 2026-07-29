import { useState } from 'react';
import { request } from 'librechat-data-provider';
import { useQuery } from '@tanstack/react-query';

type ObservabilityGroup = {
  snapshotId: string;
  productId: string;
  experiment: { id: string; variant: string } | null;
  sampleSize: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  latencyMs: { average: number; p50: number; p95: number };
  tokens: { total: number; average: number };
};

type ObservabilityResults = {
  schemaVersion: number;
  source: string;
  truthSource: string;
  individualTracesExposed: boolean;
  windowDays: number;
  experimentId: string | null;
  generatedAt: string;
  groups: ObservabilityGroup[];
};

const WINDOWS = [
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
  { days: 90, label: '90 天' },
] as const;

const msText = (value: number) => `${Math.round(value)} ms`;
const rateText = (value: number) => `${Math.round(value * 100)}%`;
const countText = (value: number) => new Intl.NumberFormat('zh-CN').format(Math.round(value));
const timeText = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

export default function ObservabilityPanel() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const results = useQuery<ObservabilityResults>(
    ['lifeAdminProductObservability', windowDays],
    () =>
      request.get<ObservabilityResults>(
        `/api/life/admin/product-observability/results?windowDays=${windowDays}`,
      ),
    { refetchInterval: 60000 },
  );

  if (results.isLoading) {
    return <p className="text-life-sm text-text-secondary">读取中…</p>;
  }
  if (!results.data) {
    return (
      <p role="alert" className="text-life-sm text-red-600">
        观测结果读取失败:{(results.error as Error | undefined)?.message || '稍后再试'}
      </p>
    );
  }

  const { groups, generatedAt } = results.data;

  return (
    <section>
      <p className="mb-3 text-life-meta text-text-secondary">
        按产品快照与实验变体聚合的回合结果。这里没有任何一条对话、用户或单次 trace——
        只有元数据。产品真相仍在 Git 的 Product Snapshot。
      </p>

      <div className="mb-4 flex items-center gap-2" role="group" aria-label="统计窗口">
        {WINDOWS.map((item) => (
          <button
            key={item.days}
            type="button"
            aria-pressed={windowDays === item.days}
            onClick={() => setWindowDays(item.days)}
            className={
              windowDays === item.days
                ? 'rounded-full border border-life-cinnabar px-3 py-1 text-life-sm text-life-cinnabar'
                : 'rounded-full border border-border-light px-3 py-1 text-life-sm text-text-secondary hover:text-text-primary'
            }
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-life-meta text-text-secondary">
          统计于 {timeText(generatedAt)}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-border-light bg-surface-primary p-5 text-life-sm text-text-secondary">
          这个窗口还没有观测事件。产品运行时开始处理真实回合后这里才会有数据。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-light">
          <table className="w-full text-left text-life-sm">
            <thead className="bg-surface-secondary text-life-meta text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">产品 / 实验</th>
                <th className="px-4 py-2.5 font-medium">快照</th>
                <th className="px-4 py-2.5 font-medium">回合</th>
                <th className="px-4 py-2.5 font-medium">成功率</th>
                <th className="px-4 py-2.5 font-medium">延迟 均值 / p95</th>
                <th className="px-4 py-2.5 font-medium">Token 合计 / 均值</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr
                  key={`${group.snapshotId}:${group.experiment?.variant ?? 'none'}`}
                  className="border-t border-border-light"
                >
                  <td className="px-4 py-2.5">
                    <p className="text-text-primary">{group.productId}</p>
                    <p className="text-life-meta text-text-secondary">
                      {group.experiment
                        ? `${group.experiment.id} · ${group.experiment.variant}`
                        : '无实验分配'}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-life-meta text-text-secondary">
                    {group.snapshotId.slice(0, 12)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {countText(group.sampleSize)}
                    <span className="ml-1 text-life-meta text-text-secondary">
                      成功 {countText(group.successCount)} / 失败 {countText(group.failureCount)}
                    </span>
                  </td>
                  <td
                    className={
                      group.failureCount > 0
                        ? 'px-4 py-2.5 font-mono text-life-cinnabar'
                        : 'px-4 py-2.5 font-mono text-text-primary'
                    }
                  >
                    {rateText(group.successRate)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {msText(group.latencyMs.average)} / {msText(group.latencyMs.p95)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {countText(group.tokens.total)} / {countText(group.tokens.average)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
