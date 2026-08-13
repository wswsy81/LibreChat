import { useLocalize } from '~/hooks';
import PublicMistMap from './PublicMistMap';

const ADVISOR_LOOP_KEYS = [
  ['com_life_public_loop_step_1', 'com_life_public_loop_step_1_help'],
  ['com_life_public_loop_step_2', 'com_life_public_loop_step_2_help'],
  ['com_life_public_loop_step_3', 'com_life_public_loop_step_3_help'],
  ['com_life_public_loop_step_4', 'com_life_public_loop_step_4_help'],
] as const;

export default function PublicHero({ children }: { children?: React.ReactNode }) {
  const localize = useLocalize();

  return (
    <div className="space-y-10 lg:space-y-12">
      <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <section className="min-w-0 lg:pt-3">
          <p className="inline-flex border border-life-cinnabar/35 px-3 py-1.5 font-life-mono text-life-meta tracking-[0.13em] text-life-cinnabar">
            {localize('com_life_public_kicker')}
          </p>
          <h1 className="mt-4 max-w-[15em] font-life-serif text-life-title font-black sm:text-life-display">
            {localize('com_life_public_title')}
          </h1>
          <p className="mt-4 max-w-[31em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-[#c8bdad] sm:text-life-body sm:leading-8">
            {localize('com_life_public_description')}
          </p>
          {children}
        </section>

        <PublicMistMap />
      </div>

      <section className="overflow-hidden border border-life-ink/45 bg-[#F7F4EB] shadow-[0_18px_70px_rgba(23,32,26,0.07)] dark:border-white/20 dark:bg-white/5 lg:grid lg:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b border-life-rule p-5 dark:border-white/10 sm:p-7 lg:flex lg:flex-col lg:justify-between lg:border-b-0 lg:border-r">
          <div>
            <span className="font-life-mono text-life-meta tracking-[0.12em] text-life-brass">
              {localize('com_life_public_loop_eyebrow')}
            </span>
            <h2 className="mt-3 max-w-[12em] font-life-serif text-life-lead font-black sm:text-life-title">
              {localize('com_life_public_loop_title')}
            </h2>
          </div>
          <p className="mt-5 border-l-2 border-life-moss py-1 pl-4 font-life-kai text-life-sm leading-7 text-life-muted dark:text-[#c8bdad] lg:mt-10">
            {localize('com_life_public_loop_trust')}
          </p>
        </div>

        <ol className="divide-y divide-life-rule px-5 dark:divide-white/10 sm:px-7">
          {ADVISOR_LOOP_KEYS.map(([titleKey, helpKey], index) => (
            <li
              key={titleKey}
              className="grid grid-cols-[2.5rem_1fr] gap-3 py-5 sm:grid-cols-[3rem_1fr] sm:gap-4 sm:py-6"
            >
              <span className="pt-1 font-life-mono text-life-meta text-life-cinnabar">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-life-serif text-life-body font-semibold text-life-ink dark:text-white">
                  {localize(titleKey)}
                </h3>
                <p className="mt-1 font-life-sans text-life-sm leading-7 text-life-muted dark:text-[#c8bdad]">
                  {localize(helpKey)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
