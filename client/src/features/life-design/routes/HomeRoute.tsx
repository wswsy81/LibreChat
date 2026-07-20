import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useGetStartupConfig, useLifeBootstrapQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { ProductShell } from '~/routes/Root';
import { getInviteCodeFromHash, getStoredInviteCode, storeInviteCode } from '~/utils/invite';
import { track } from '~/utils/track';
import FirstArchiveSetup from '../components/FirstArchiveSetup';
import PublicMistMap from '../components/PublicMistMap';
import ReturningHome from '../components/ReturningHome';
import { LifeError, LifeLoading } from '../components/PageState';

const SAMPLE_BARS = [
  { label: 'com_life_health', value: 5, low: false },
  { label: 'com_life_work', value: 3, low: true },
  { label: 'com_life_play', value: 5, low: false },
  { label: 'com_life_love', value: 7, low: false },
] as const;

const PUBLIC_RESULT_KEYS = [
  'com_life_public_result_problem',
  'com_life_public_result_map',
  'com_life_public_result_next',
] as const;

const PUBLIC_STEPS = [
  ['com_life_public_step_one', 'com_life_public_step_one_help'],
  ['com_life_public_step_two', 'com_life_public_step_two_help'],
  ['com_life_public_step_three', 'com_life_public_step_three_help'],
] as const;

function getSampleBarClass(filled: boolean, low: boolean) {
  if (!filled) {
    return 'bg-life-rule dark:bg-white/10';
  }
  return low ? 'bg-life-cinnabar' : 'bg-life-moss';
}

function ArchiveSample() {
  const localize = useLocalize();
  return (
    <section aria-label={localize('com_life_sample_no')}>
      <div className="relative border border-life-ink/60 bg-[#F7F4EB] p-5 dark:border-white/20 sm:p-8">
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
              className="flex items-center gap-3 border-b border-life-rule py-2.5 dark:border-white/10 sm:gap-4"
            >
              <span className="w-10 flex-none font-life-serif text-life-sm font-semibold sm:w-12">
                {localize(bar.label)}
              </span>
              <span className="flex h-[5px] flex-1 gap-[2px]">
                {Array.from({ length: 10 }, (_, index) => (
                  <i
                    key={index}
                    className={`flex-1 ${getSampleBarClass(index < bar.value, bar.low)}`}
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
        <p className="mt-3 font-life-mono text-life-meta tracking-[0.04em] text-life-muted dark:text-gray-400">
          {localize('com_life_sample_scale')}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {(['com_life_line_current', 'com_life_line_gone', 'com_life_line_wild'] as const).map(
            (key, index) => (
              <span
                key={key}
                className={`border px-2.5 py-1 font-life-mono text-[10px] sm:px-3 sm:text-life-meta ${
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
    </section>
  );
}

function PublicHome() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const registrationEnabled = startupConfig?.registrationEnabled === true;
  const startRegistration = () => {
    if (getStoredInviteCode()) {
      track('invite_registration_started');
    }
  };
  return (
    <main className="min-h-screen overflow-x-hidden bg-life-paper text-life-ink dark:bg-[#171512] dark:text-[#f6f0e6]">
      <div className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
        <header className="flex items-center justify-between gap-3 border-b border-life-rule pb-4 dark:border-white/10 sm:gap-4 sm:pb-5">
          <div>
            <p className="font-life-mono text-[9px] tracking-[0.23em] text-life-cinnabar sm:text-life-meta sm:tracking-[0.26em]">
              {localize('com_life_brand_eyebrow')}
            </p>
            <p className="mt-1 font-life-serif text-life-body font-black sm:text-life-lead">
              {localize('com_life_brand')}
            </p>
          </div>
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <Link
              to="/faq"
              className="inline-flex min-h-11 items-center px-2 font-life-sans text-[13px] text-life-muted transition hover:text-life-ink dark:text-[#c8bdad] dark:hover:text-white sm:px-3 sm:text-life-sm"
            >
              {localize('com_life_faq_nav')}
            </Link>
            <Link
              to="/login?redirect_to=%2Fhome"
              className="inline-flex min-h-11 items-center border border-life-ink/20 px-3 font-life-sans text-[13px] transition hover:bg-life-ink/5 dark:border-white/15 dark:hover:bg-white/5 sm:px-5 sm:text-life-sm"
            >
              {localize('com_life_login_archive')}
            </Link>
          </nav>
        </header>

        <div className="grid items-center gap-10 py-9 sm:py-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:py-16">
          <section className="min-w-0">
            <p className="inline-flex border border-life-cinnabar/35 px-3 py-1.5 font-life-mono text-[10px] tracking-[0.13em] text-life-cinnabar sm:text-life-meta">
              {localize('com_life_public_kicker')}
            </p>
            <h1 className="mt-5 max-w-[16em] font-life-serif text-[34px] font-black leading-[1.27] sm:text-life-display sm:leading-[1.22]">
              {localize('com_life_public_title')}
            </h1>
            <p className="mt-5 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted dark:text-[#c8bdad] sm:mt-6 sm:text-life-lead sm:leading-9">
              {localize('com_life_public_description')}
            </p>

            <div className="mt-6 grid border-y border-life-rule dark:border-white/10 sm:grid-cols-3">
              {PUBLIC_RESULT_KEYS.map((key, index) => (
                <div
                  key={key}
                  className="flex items-baseline gap-3 border-b border-life-rule py-3 last:border-b-0 dark:border-white/10 sm:block sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0"
                >
                  <span className="font-life-mono text-[9px] tracking-[0.1em] text-life-cinnabar">
                    0{index + 1}
                  </span>
                  <p className="font-life-serif text-[14px] font-semibold leading-6 sm:mt-1">
                    {localize(key)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Button
                asChild
                className="min-h-12 w-full rounded-[4px] bg-life-moss px-6 font-life-sans text-life-body text-life-paper hover:bg-life-moss-deep sm:w-auto sm:px-7"
              >
                <Link to="/register" onClick={startRegistration}>
                  {localize('com_life_start_first')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-12 w-full rounded-[4px] border-life-ink/25 bg-transparent px-6 font-life-sans dark:border-white/15 sm:w-auto sm:px-7"
              >
                <Link to="/login?redirect_to=%2Fhome">{localize('com_life_login_archive')}</Link>
              </Button>
            </div>
            {!registrationEnabled && (
              <p
                className="mt-5 max-w-[32em] border-l-2 border-life-brass py-1 pl-4 font-life-kai text-life-sm leading-7 text-life-brass sm:text-life-body sm:leading-8"
                role="status"
              >
                {localize('com_life_invite_only_notice')}
              </p>
            )}
            <p className="mt-6 font-life-mono text-life-meta leading-6 tracking-[0.04em] text-life-muted dark:text-[#a99f92]">
              {localize('com_life_boundary_short')}
            </p>
          </section>
          <PublicMistMap />
        </div>

        <section className="border-t border-life-rule py-12 dark:border-white/10 sm:py-16">
          <p className="font-life-mono text-[10px] tracking-[0.18em] text-life-cinnabar">
            {localize('com_life_public_process_kicker')}
          </p>
          <h2 className="mt-3 max-w-[18em] font-life-serif text-life-title font-black leading-[1.35]">
            {localize('com_life_public_process_title')}
          </h2>
          <div className="mt-8 border-t border-life-ink/45 dark:border-white/25">
            {PUBLIC_STEPS.map(([titleKey, helpKey], index) => (
              <article
                key={titleKey}
                className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-2 border-b border-life-rule py-5 dark:border-white/10 lg:grid-cols-[96px_260px_1fr] lg:gap-x-6"
              >
                <p className="pt-[3px] font-life-mono text-[10px] tracking-[0.14em] text-life-cinnabar">
                  STEP {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="font-life-serif text-life-lead font-bold">{localize(titleKey)}</h3>
                <p className="col-start-2 font-life-sans text-life-sm leading-7 text-life-muted dark:text-[#c8bdad] lg:col-start-3">
                  {localize(helpKey)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid items-center gap-8 border-t border-life-rule py-12 dark:border-white/10 sm:py-16 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="font-life-mono text-[10px] tracking-[0.18em] text-life-cinnabar">
              {localize('com_life_public_archive_kicker')}
            </p>
            <h2 className="mt-3 font-life-serif text-life-title font-black leading-[1.35]">
              {localize('com_life_public_archive_title')}
            </h2>
            <p className="mt-5 font-life-sans text-life-body leading-8 text-life-muted dark:text-[#c8bdad]">
              {localize('com_life_public_archive_description')}
            </p>
            <p className="mt-5 font-life-kai text-life-body leading-8 text-life-brass">
              {localize('com_life_sample_caption')}
            </p>
          </div>
          <ArchiveSample />
        </section>

        <footer className="flex flex-col gap-3 border-t border-life-rule py-7 font-life-mono text-life-meta leading-6 tracking-[0.04em] text-life-muted dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
          <span>{localize('com_life_boundary_short')}</span>
          <span>{localize('com_life_public_private')}</span>
        </footer>
      </div>
    </main>
  );
}

export default function HomeRoute() {
  const localize = useLocalize();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAuthReady } = useAuthContext();
  const bootstrap = useLifeBootstrapQuery({ enabled: isAuthReady && isAuthenticated });

  useEffect(() => {
    const inviteCode = getInviteCodeFromHash(location.hash);
    if (!inviteCode) {
      return;
    }
    storeInviteCode(inviteCode);
    track('invite_opened');
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

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
