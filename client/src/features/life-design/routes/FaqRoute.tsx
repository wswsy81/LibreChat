import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';

const FAQ_GROUPS = [
  { label: 'com_life_faq_group_product', items: [1, 20, 22, 2, 3, 4, 5, 21] },
  { label: 'com_life_faq_group_limits', items: [6, 7, 8, 9] },
  { label: 'com_life_faq_group_data', items: [10, 11, 12, 13, 14, 15] },
  { label: 'com_life_faq_group_trust', items: [18, 19] },
] as const;

const DISPLAY_INDEX: Record<number, number> = FAQ_GROUPS.flatMap((g) => g.items).reduce(
  (acc, n, i) => ({ ...acc, [n]: i + 1 }),
  {},
);

export default function FaqRoute() {
  const localize = useLocalize();
  return (
    <main className="min-h-screen overflow-x-hidden bg-life-paper text-life-ink dark:bg-[#171512] dark:text-[#f6f0e6]">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10 lg:py-14">
        <Link
          to="/home"
          className="inline-flex min-h-11 items-center gap-2 font-life-mono text-life-meta tracking-[0.06em] text-life-muted transition hover:text-life-ink dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {localize('com_life_faq_back')}
        </Link>

        <header className="mt-6 border-b border-life-ink/60 pb-8 dark:border-white/20">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar">
            {localize('com_life_faq_eyebrow')}
          </p>
          <h1 className="mt-4 text-pretty font-life-serif text-life-title font-black leading-[1.3] sm:text-life-display">
            {localize('com_life_faq_title')}
          </h1>
          <p className="mt-5 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted dark:text-[#c8bdad]">
            {localize('com_life_faq_desc')}
          </p>
        </header>

        {FAQ_GROUPS.map((group) => (
          <section key={group.label} className="pt-10 sm:pt-12">
            <h2 className="font-life-mono text-life-meta tracking-[0.18em] text-life-cinnabar">
              {localize(group.label)}
            </h2>
            <dl className="mt-4 border-t border-life-rule dark:border-white/10">
              {group.items.map((n) => (
                <div key={n} className="border-b border-life-rule py-6 dark:border-white/10">
                  <dt className="flex gap-3 font-life-serif text-life-lead font-bold leading-[1.5]">
                    <span className="mt-1 font-life-mono text-life-meta text-life-cinnabar">
                      {String(DISPLAY_INDEX[n]).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      {localize(`com_life_faq_q${n}` as TranslationKeys)}
                    </span>
                  </dt>
                  <dd className="mt-3 pl-8 font-life-sans text-life-body leading-8 text-life-muted dark:text-[#c8bdad]">
                    {localize(`com_life_faq_a${n}` as TranslationKeys)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <footer className="mt-10 flex flex-col gap-2 border-t border-life-rule py-8 font-life-mono text-life-meta leading-6 tracking-[0.04em] text-life-muted dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <span>{localize('com_life_faq_updated')}</span>
          <Link to="/home" className="transition hover:text-life-ink dark:hover:text-white">
            {localize('com_life_faq_back')}
          </Link>
        </footer>
      </div>
    </main>
  );
}
