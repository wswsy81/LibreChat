import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useLifeBootstrapQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { ProductShell } from '~/routes/Root';
import FirstArchiveSetup from '../components/FirstArchiveSetup';
import ReturningHome from '../components/ReturningHome';
import { LifeError, LifeLoading } from '../components/PageState';

const SAMPLE_BARS = [
  { label: 'com_life_health', value: 5, low: false },
  { label: 'com_life_work', value: 3, low: true },
  { label: 'com_life_play', value: 5, low: false },
  { label: 'com_life_love', value: 7, low: false },
] as const;

function PublicHome() {
  const localize = useLocalize();
  return (
    <main className="min-h-screen overflow-hidden bg-life-paper text-life-ink dark:bg-[#171512] dark:text-[#f6f0e6]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4 border-b border-life-rule pb-5 dark:border-white/10">
          <div>
            <p className="font-life-mono text-life-meta tracking-[0.26em] text-life-cinnabar">
              {localize('com_life_brand_eyebrow')}
            </p>
            <p className="mt-1 font-life-serif text-life-lead font-black">{localize('com_life_brand')}</p>
          </div>
          <Link
            to="/login?redirect_to=%2Fhome"
            className="inline-flex min-h-11 items-center border border-life-ink/20 px-5 font-life-sans text-life-sm transition hover:bg-life-ink/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            {localize('com_life_login_archive')}
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <section>
            <p className="font-life-mono text-life-meta tracking-[0.2em] text-life-muted dark:text-gray-400">
              {localize('com_life_public_kicker')}
            </p>
            <h1 className="mt-6 max-w-4xl font-life-serif text-life-title font-black leading-[1.32] sm:text-life-display sm:leading-[1.28]">
              {localize('com_life_public_title')}
            </h1>
            <p className="mt-7 max-w-[32em] font-life-sans text-life-lead leading-9 text-life-muted dark:text-[#c8bdad]">
              {localize('com_life_public_description')}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="min-h-12 rounded-[4px] bg-life-moss px-7 font-life-sans text-life-body text-life-paper hover:bg-life-moss-deep"
              >
                <Link to="/register">
                  {localize('com_life_start_first')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-12 rounded-[4px] border-life-ink/25 bg-transparent px-7 font-life-sans dark:border-white/15"
              >
                <Link to="/login?redirect_to=%2Fhome">{localize('com_life_login_archive')}</Link>
              </Button>
            </div>
            <p className="mt-6 font-life-mono text-life-meta text-life-muted dark:text-[#a99f92]">
              {localize('com_life_boundary_short')}
            </p>
          </section>

          {/* 真实制品缩略:不解释流程,直接给看一份存档长什么样 */}
          <section aria-label={localize('com_life_sample_no')}>
            <div className="relative border border-life-ink/60 bg-[#F7F4EB] p-6 dark:border-white/20 dark:bg-white/5 sm:p-8">
              <p className="font-life-mono text-[10.5px] tracking-[0.14em] text-life-muted dark:text-gray-400">
                {localize('com_life_sample_no')}
              </p>
              <p className="mt-4 font-life-serif text-life-lead font-semibold leading-[1.7] underline decoration-life-cinnabar/50 decoration-2 underline-offset-[6px]">
                {localize('com_life_sample_problem')}
              </p>
              <div className="mt-6 border-t border-life-ink/50 dark:border-white/20">
                {SAMPLE_BARS.map((bar) => (
                  <div
                    key={bar.label}
                    className="flex items-center gap-4 border-b border-life-rule py-2.5 dark:border-white/10"
                  >
                    <span className="w-12 flex-none font-life-serif text-life-sm font-semibold">
                      {localize(bar.label)}
                    </span>
                    <span className="flex h-[5px] flex-1 gap-[2px]">
                      {Array.from({ length: 10 }, (_, index) => (
                        <i
                          key={index}
                          className={`flex-1 ${
                            index < bar.value
                              ? bar.low
                                ? 'bg-life-cinnabar'
                                : 'bg-life-moss'
                              : 'bg-life-rule dark:bg-white/10'
                          }`}
                        />
                      ))}
                    </span>
                    <span
                      className={`w-10 flex-none text-right font-life-mono text-life-meta tabular-nums ${
                        bar.low ? 'text-life-cinnabar' : 'text-life-muted dark:text-gray-400'
                      }`}
                    >
                      {bar.value}/10
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {(['com_life_line_current', 'com_life_line_gone', 'com_life_line_wild'] as const).map(
                  (key, index) => (
                    <span
                      key={key}
                      className={`border px-3 py-1 font-life-mono text-life-meta ${
                        index === 2
                          ? 'border-life-cinnabar/50 text-life-cinnabar'
                          : 'border-life-ink/25 text-life-muted dark:border-white/20 dark:text-gray-400'
                      }`}
                    >
                      {String(index + 1).padStart(2, '0')} {localize(key)}
                    </span>
                  ),
                )}
              </div>
            </div>
            <p className="mt-4 font-life-kai text-life-body leading-7 text-life-brass">
              {localize('com_life_sample_caption')}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function HomeRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAuthReady } = useAuthContext();
  const bootstrap = useLifeBootstrapQuery({ enabled: isAuthReady && isAuthenticated });

  if (!isAuthReady) {
    return <LifeLoading fullScreen />;
  }
  if (!isAuthenticated) {
    return <PublicHome />;
  }

  let content;
  if (bootstrap.isLoading) {
    content = <LifeLoading />;
  } else if (bootstrap.isError || bootstrap.data?.profileState === 'unavailable') {
    content = (
      <LifeError
        title={localize('com_life_archive_unavailable')}
        message={localize('com_life_archive_unavailable_help')}
        onRetry={() => bootstrap.refetch()}
        onContinue={() => navigate('/resume')}
      />
    );
  } else if (bootstrap.data?.hasSubstantiveProfile) {
    content = <ReturningHome bootstrap={bootstrap.data} />;
  } else {
    content = (
      <div className="h-full overflow-y-auto bg-life-paper px-5 py-10 dark:bg-surface-secondary sm:px-8">
        <FirstArchiveSetup initialName={user?.name || ''} />
      </div>
    );
  }

  return <ProductShell>{content}</ProductShell>;
}
