import { useLocalize } from '~/hooks';
import PublicMistMap from './PublicMistMap';

const PUBLIC_RESULT_KEYS = [
  'com_life_public_result_problem',
  'com_life_public_result_map',
  'com_life_public_result_next',
] as const;

export default function PublicHero({ children }: { children?: React.ReactNode }) {
  const localize = useLocalize();

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
      <section className="min-w-0">
        <p className="inline-flex border border-life-cinnabar/35 px-3 py-1.5 font-life-mono text-life-meta tracking-[0.13em] text-life-cinnabar">
          {localize('com_life_public_kicker')}
        </p>
        <h1 className="mt-4 max-w-[15em] font-life-serif text-life-title font-black sm:text-life-display">
          {localize('com_life_public_title')}
        </h1>
        <p className="mt-4 max-w-[30em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-[#c8bdad] sm:text-life-body sm:leading-8">
          {localize('com_life_public_description')}
        </p>

        <div className="mt-6 grid border-y border-life-rule dark:border-white/10 sm:grid-cols-3">
          {PUBLIC_RESULT_KEYS.map((key, index) => (
            <div
              key={key}
              className="flex items-baseline gap-3 border-b border-life-rule py-3 last:border-b-0 dark:border-white/10 sm:block sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
            >
              <span className="font-life-mono text-life-meta tracking-[0.1em] text-life-cinnabar">
                0{index + 1}
              </span>
              <p className="font-life-serif text-life-sm font-semibold leading-6 sm:mt-1">
                {localize(key)}
              </p>
            </div>
          ))}
        </div>

        {children}
      </section>

      <PublicMistMap />
    </div>
  );
}
