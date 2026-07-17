import BasicsForm from '../components/BasicsForm';
import { useLocalize } from '~/hooks';

export default function AboutRoute() {
  const localize = useLocalize();
  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="max-w-4xl border-b border-life-ink/70 pb-8 dark:border-white/30">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_about_eyebrow')}
          </p>
          <h1 className="mt-4 text-pretty font-life-serif text-life-display font-black leading-[1.12] text-life-ink dark:text-gray-100 sm:text-6xl">
            {localize('com_life_about_title')}
          </h1>
          <p className="mt-5 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted dark:text-gray-400">
            {localize('com_life_about_description')}
          </p>
        </header>
        <section className="max-w-4xl py-8 sm:py-10">
          <BasicsForm />
        </section>
      </div>
    </main>
  );
}
