import { ArrowRight, Compass, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useLifeBootstrapQuery } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { ProductShell } from '~/routes/Root';
import FirstArchiveSetup from '../components/FirstArchiveSetup';
import ReturningHome from '../components/ReturningHome';
import { LifeError, LifeLoading } from '../components/PageState';

function PublicHome() {
  const localize = useLocalize();
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f0e8] text-[#201d18] dark:bg-[#171512] dark:text-[#f6f0e6]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-amber-800 dark:text-amber-300">
              {localize('com_life_brand_eyebrow')}
            </p>
            <p className="mt-1 text-lg font-semibold">{localize('com_life_brand')}</p>
          </div>
          <Link
            to="/login?redirect_to=%2Fhome"
            className="inline-flex min-h-11 items-center rounded-full border border-black/10 px-5 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            {localize('com_life_login_archive')}
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.2fr_0.8fr] lg:py-20">
          <section>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-900/10 bg-white/55 px-4 py-2 text-sm text-amber-900 shadow-sm backdrop-blur dark:border-amber-200/10 dark:bg-white/5 dark:text-amber-200">
              <Sparkles className="h-4 w-4" />
              {localize('com_life_public_kicker')}
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl">
              {localize('com_life_public_title')}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5d5549] dark:text-[#c8bdad] sm:text-xl">
              {localize('com_life_public_description')}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                className="min-h-12 rounded-full bg-[#8d4b20] px-7 text-white hover:bg-[#743b17]"
              >
                <Link to="/register">
                  {localize('com_life_start_first')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-12 rounded-full border-black/10 bg-transparent px-7 dark:border-white/15"
              >
                <Link to="/login?redirect_to=%2Fhome">{localize('com_life_login_archive')}</Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-[#756c60] dark:text-[#a99f92]">
              {localize('com_life_boundary_short')}
            </p>
          </section>

          <section className="relative">
            <div className="absolute -inset-10 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="relative space-y-4 rounded-[36px] border border-black/10 bg-white/70 p-5 shadow-[0_30px_90px_rgba(76,54,31,0.15)] backdrop-blur dark:border-white/10 dark:bg-white/5 sm:p-7">
              {(
                [
                  {
                    number: '01',
                    title: 'com_life_public_step_one',
                    help: 'com_life_public_step_one_help',
                    Icon: Compass,
                  },
                  {
                    number: '02',
                    title: 'com_life_public_step_two',
                    help: 'com_life_public_step_two_help',
                    Icon: Sparkles,
                  },
                  {
                    number: '03',
                    title: 'com_life_public_step_three',
                    help: 'com_life_public_step_three_help',
                    Icon: ShieldCheck,
                  },
                ] as const
              ).map(({ number, title, help, Icon }) => (
                <div
                  key={number}
                  className="rounded-3xl border border-black/5 bg-white/75 p-5 dark:border-white/5 dark:bg-black/10"
                >
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 text-xs font-semibold tracking-[0.16em] text-amber-800 dark:text-amber-300">
                      {number}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                        <h2 className="font-semibold">{localize(title)}</h2>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#6c6256] dark:text-[#b7ab9c]">
                        {localize(help)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
      <div className="h-full overflow-y-auto bg-surface-secondary px-5 py-10 sm:px-8">
        <FirstArchiveSetup initialName={user?.name || ''} />
      </div>
    );
  }

  return <ProductShell>{content}</ProductShell>;
}
