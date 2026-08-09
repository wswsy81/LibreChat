import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@librechat/client';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getInviteCodeFromHash, getStoredInviteCode, storeInviteCode } from '~/utils/invite';
import { getEntryHouseFromSearch, getStoredEntryHouse, storeEntryHouse } from '../entry';
import { useGetStartupConfig, useLifeBootstrapQuery } from '~/data-provider';
import { LifeError, LifeLoading } from '../components/PageState';
import FirstArchiveSetup from '../components/FirstArchiveSetup';
import ReturningHome from '../components/ReturningHome';
import { useAuthContext, useLocalize } from '~/hooks';
import PublicHero from '../components/PublicHero';
import { ProductShell } from '~/routes/Root';
import { track } from '~/utils/track';

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
            <p className="font-life-mono text-life-meta tracking-[0.23em] text-life-cinnabar sm:tracking-[0.26em]">
              {localize('com_life_brand_eyebrow')}
            </p>
            <p className="mt-1 font-life-serif text-life-body font-black sm:text-life-lead">
              {localize('com_life_brand')}
            </p>
          </div>
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <Link
              to="/faq"
              className="inline-flex min-h-11 items-center px-2 font-life-sans text-life-sm text-life-muted transition hover:text-life-ink dark:text-[#c8bdad] dark:hover:text-white sm:px-3"
            >
              {localize('com_life_faq_nav')}
            </Link>
            <Link
              to="/login?redirect_to=%2Fhome"
              className="inline-flex min-h-11 items-center border border-life-ink/20 px-3 font-life-sans text-life-sm transition hover:bg-life-ink/5 dark:border-white/15 dark:hover:bg-white/5 sm:px-5"
            >
              {localize('com_life_login_archive')}
            </Link>
          </nav>
        </header>

        <section className="py-9 sm:py-12 lg:py-14">
          <PublicHero>
            {(selectedHouse) => (
              <>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    className="min-h-12 w-full rounded-[4px] bg-life-moss px-6 font-life-sans text-life-body text-life-paper hover:bg-life-moss-deep sm:w-auto sm:px-7"
                  >
                    <Link to={`/register?entryHouse=${selectedHouse}`} onClick={startRegistration}>
                      {localize('com_life_start_first')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-12 w-full rounded-[4px] border-life-ink/25 bg-transparent px-6 font-life-sans dark:border-white/15 sm:w-auto sm:px-7"
                  >
                    <Link to="/login?redirect_to=%2Fhome">
                      {localize('com_life_login_archive')}
                    </Link>
                  </Button>
                </div>
                {!registrationEnabled && (
                  <p
                    className="mt-5 max-w-[32em] border-l-2 border-life-brass py-1 pl-4 font-life-kai text-life-sm leading-7 text-life-brass"
                    role="status"
                  >
                    {localize('com_life_invite_only_notice')}
                  </p>
                )}
              </>
            )}
          </PublicHero>
        </section>

        <footer className="flex flex-col gap-3 border-t border-life-rule py-7 font-life-mono text-life-meta leading-6 tracking-[0.04em] text-life-muted dark:border-white/10 sm:flex-row sm:items-center sm:justify-end">
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
  const { isAuthenticated, isAuthReady } = useAuthContext();
  const bootstrap = useLifeBootstrapQuery({ enabled: isAuthReady && isAuthenticated });
  const requestedEntryHouse = getEntryHouseFromSearch(location.search);
  const initialEntryHouse = requestedEntryHouse ?? getStoredEntryHouse();
  const newMatterRequested = new URLSearchParams(location.search).get('new') === '1';

  useEffect(() => {
    const inviteCode = getInviteCodeFromHash(location.hash);
    if (!inviteCode) {
      return;
    }
    storeInviteCode(inviteCode);
    track('invite_opened');
    navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (requestedEntryHouse) {
      storeEntryHouse(requestedEntryHouse);
    }
  }, [requestedEntryHouse]);

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
  } else if (
    (bootstrap.data?.hasSubstantiveProfile ||
      bootstrap.data?.domainConversations?.length ||
      bootstrap.data?.unscopedConversations?.length) &&
    !newMatterRequested
  ) {
    content = <ReturningHome bootstrap={bootstrap.data} />;
  } else {
    const isNewMatter = Boolean(
      bootstrap.data?.hasSubstantiveProfile ||
        bootstrap.data?.domainConversations?.length ||
        bootstrap.data?.unscopedConversations?.length,
    );
    const archiveName = bootstrap.data?.summary?.alias || bootstrap.data?.user?.name || null;
    content = (
      <div className="h-full overflow-y-auto bg-life-paper px-5 py-10 dark:bg-surface-secondary sm:px-8">
        <FirstArchiveSetup
          initialEntryHouse={initialEntryHouse}
          mode={isNewMatter ? 'new_matter' : 'first_archive'}
          archiveName={archiveName}
          domainConversations={bootstrap.data?.domainConversations}
        />
      </div>
    );
  }

  return <ProductShell>{content}</ProductShell>;
}
