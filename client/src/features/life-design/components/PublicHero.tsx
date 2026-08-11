import { useLocalize } from '~/hooks';

/**
 * 公开首页 hero：先说清长期人生顾问的主循环，再邀请用户从近况开始。
 * 三条未来线只在重大分岔且用户明确同意后出现，不承担注册前主承诺。
 */

const ADVISOR_LOOP_KEYS = [
  ['com_life_public_loop_step_1', 'com_life_public_loop_step_1_help'],
  ['com_life_public_loop_step_2', 'com_life_public_loop_step_2_help'],
  ['com_life_public_loop_step_3', 'com_life_public_loop_step_3_help'],
  ['com_life_public_loop_step_4', 'com_life_public_loop_step_4_help'],
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
        {children}
      </section>

      <section className="overflow-hidden border border-life-ink/45 bg-[#F7F4EB] p-5 shadow-[0_18px_70px_rgba(23,32,26,0.08)] dark:border-white/20 dark:bg-white/5 sm:p-7">
        <div className="flex items-baseline justify-between gap-4 border-b border-life-rule pb-3 dark:border-white/10">
          <h2 className="font-life-serif text-life-lead font-black">
            {localize('com_life_public_loop_title')}
          </h2>
          <span className="font-life-mono text-life-meta tracking-[0.12em] text-life-brass">
            {localize('com_life_public_loop_eyebrow')}
          </span>
        </div>
        <ol className="mt-2 divide-y divide-life-rule dark:divide-white/10">
          {ADVISOR_LOOP_KEYS.map(([titleKey, helpKey], index) => (
            <li key={titleKey} className="grid grid-cols-[2.25rem_1fr] gap-3 py-4">
              <span className="font-life-mono text-life-meta text-life-cinnabar">
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
        <p className="border-l-2 border-life-moss py-1 pl-4 font-life-kai text-life-sm leading-7 text-life-muted dark:text-[#c8bdad]">
          {localize('com_life_public_loop_trust')}
        </p>
      </section>
    </div>
  );
}
