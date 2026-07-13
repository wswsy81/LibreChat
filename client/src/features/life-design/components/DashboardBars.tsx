import type { LifeDashboards } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const items = [
  { key: 'health', label: 'com_life_health', en: 'HEALTH' },
  { key: 'work', label: 'com_life_work', en: 'WORK' },
  { key: 'play', label: 'com_life_play', en: 'PLAY' },
  { key: 'love', label: 'com_life_love', en: 'LOVE' },
] as const;

const LOW_SCORE = 3;

export default function DashboardBars({ values = {} }: { values?: LifeDashboards }) {
  const localize = useLocalize();

  return (
    <div
      className="border-t border-life-ink/70 dark:border-white/40"
      aria-label={localize('com_life_bars_summary')}
    >
      {items.map((item) => {
        const value = values[item.key];
        const filled = typeof value === 'number' ? Math.max(0, Math.min(10, Math.round(value))) : 0;
        const low = typeof value === 'number' && value <= LOW_SCORE;
        const fill = low ? 'bg-life-cinnabar' : 'bg-life-moss dark:bg-life-moss';
        return (
          <div
            key={item.key}
            className="grid grid-cols-[96px_1fr_72px] items-center gap-5 border-b border-life-rule py-4 dark:border-white/10"
          >
            <div>
              <span className="font-life-serif text-base font-semibold text-life-ink dark:text-gray-100">
                {localize(item.label)}
              </span>
              <span className="block font-life-mono text-[10px] tracking-[0.14em] text-life-muted dark:text-gray-500">
                {item.en}
              </span>
            </div>
            <div className="flex h-[7px] gap-[3px]" role="presentation">
              {Array.from({ length: 10 }, (_, index) => (
                <i
                  key={index}
                  className={`flex-1 ${index < filled ? fill : 'bg-life-rule dark:bg-white/10'}`}
                />
              ))}
            </div>
            <span
              className={`text-right font-life-mono text-[15px] tabular-nums ${
                low ? 'text-life-cinnabar' : 'text-life-ink dark:text-gray-200'
              }`}
            >
              {typeof value === 'number' ? value : '—'}
              <span className="text-life-muted dark:text-gray-500">/10</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
