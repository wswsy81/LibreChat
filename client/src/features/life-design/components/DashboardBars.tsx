import type { LifeDashboards } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const items = [
  { key: 'health', label: 'com_life_health', color: 'bg-emerald-500' },
  { key: 'work', label: 'com_life_work', color: 'bg-amber-500' },
  { key: 'play', label: 'com_life_play', color: 'bg-sky-500' },
  { key: 'love', label: 'com_life_love', color: 'bg-rose-500' },
] as const;

export default function DashboardBars({ values = {} }: { values?: LifeDashboards }) {
  const localize = useLocalize();

  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label={localize('com_life_bars_summary')}>
      {items.map((item) => {
        const value = values[item.key];
        const width = typeof value === 'number' ? Math.max(0, Math.min(100, value * 10)) : 0;
        return (
          <div
            key={item.key}
            className="rounded-2xl border border-border-light bg-surface-primary p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-text-primary">{localize(item.label)}</span>
              <span className="tabular-nums text-text-secondary">
                {typeof value === 'number' ? `${value}/10` : '—'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${item.color}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
