import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Explorer } from '../components/LifeWheel';
import { LifeError, LifeLoading } from '../components/PageState';
import { useLifeBootstrapQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function MapRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const bootstrap = useLifeBootstrapQuery();

  if (bootstrap.isLoading) {
    return <LifeLoading />;
  }
  if (bootstrap.isError || !bootstrap.data) {
    return (
      <LifeError
        title={localize('com_life_map_unavailable')}
        message={localize('com_life_map_unavailable_help')}
        onRetry={() => bootstrap.refetch()}
        onContinue={() => navigate('/c/new')}
      />
    );
  }

  const archiveName =
    bootstrap.data.summary?.alias || bootstrap.data.user?.name || localize('com_life_friend');
  const unscoped = bootstrap.data.unscopedConversations ?? [];

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="max-w-4xl border-b border-life-ink/70 pb-8">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar">
            {localize('com_life_map_eyebrow')}
          </p>
          <h1 className="mt-4 font-life-serif text-life-title font-black leading-tight sm:text-life-display">
            {localize('com_life_map_page_title')}
          </h1>
          <p className="mt-5 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted">
            {localize('com_life_map_page_description')}
          </p>
          <Link
            to="/c/new"
            className="mt-6 inline-flex min-h-11 items-center border-b border-life-moss font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink"
          >
            {localize('com_life_map_direct_chat')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </header>

        <section className="py-9 sm:py-12" aria-label={localize('com_life_map_page_title')}>
          <Explorer
            wheel={bootstrap.data.summary?.lifeWheel}
            archiveName={archiveName}
            domainConversations={bootstrap.data.domainConversations}
          />
          <p className="mt-6 max-w-[34em] font-life-kai text-life-sm leading-7 text-life-muted">
            {localize('com_life_map_mode_boundary')}
          </p>
        </section>
        {unscoped.length > 0 && (
          <section className="border-t border-life-ink/70 py-9 sm:py-12">
            <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss">
              {localize('com_life_map_unscoped_eyebrow')}
            </p>
            <h2 className="mt-3 font-life-serif text-life-title font-semibold">
              {localize('com_life_map_unscoped_title')}
            </h2>
            <p className="mt-4 max-w-[34em] font-life-kai text-life-body leading-8 text-life-muted">
              {localize('com_life_map_unscoped_help')}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {unscoped.slice(0, 4).map((conversation) => (
                <Link
                  key={conversation.conversationId}
                  to={`/c/${conversation.conversationId}`}
                  className="border-l-2 border-life-rule px-4 py-3 transition hover:border-life-cinnabar hover:bg-life-cinnabar/5"
                >
                  <span className="block font-life-mono text-life-meta tracking-[0.12em] text-life-moss">
                    {localize('com_life_unscoped_conversation')}
                  </span>
                  <span className="mt-1 block font-life-kai text-life-body text-life-ink">
                    {conversation.title || localize('com_life_unscoped_resume_hint')}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
