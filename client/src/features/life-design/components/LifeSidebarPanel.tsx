import { useRecoilState } from 'recoil';
import { Link, useLocation } from 'react-router-dom';
import { Archive, Home, MessageCircleMore, NotebookPen, Plus, UserRound } from 'lucide-react';
import { useLifeBootstrapQuery } from '~/data-provider';
import { PUBLIC_MAP_LABEL_KEYS } from './PublicMistMap';
import { useAuthContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const links = [
  { href: '/home', label: 'com_life_nav_home', icon: Home },
  { href: '/resume', label: 'com_life_nav_resume', icon: MessageCircleMore },
  { href: '/inbox', label: 'com_life_nav_inbox', icon: NotebookPen },
  { href: '/archive', label: 'com_life_nav_archive', icon: Archive },
  { href: '/about', label: 'com_life_nav_about', icon: UserRound },
] as const;

export default function LifeSidebarPanel() {
  const localize = useLocalize();
  const location = useLocation();
  const { isAuthenticated } = useAuthContext();
  const [, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);
  const bootstrap = useLifeBootstrapQuery({
    enabled: isAuthenticated,
    staleTime: 30_000,
    cacheTime: 300_000,
  });
  const domains = bootstrap.data?.domainConversations ?? [];

  const closeMobile = () => {
    if (window.innerWidth <= 768) {
      setSidebarExpanded(false);
    }
  };

  let recentContent = (
    <p className="border-l-2 border-life-rule px-3 py-2 font-life-kai text-life-sm leading-6 text-text-secondary">
      {localize('com_life_no_recent_conversations')}
    </p>
  );
  if (bootstrap.isLoading) {
    recentContent = (
      <div className="space-y-2" aria-label={localize('com_life_loading')}>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-12 animate-pulse border-l-2 border-life-rule bg-surface-tertiary"
          />
        ))}
      </div>
    );
  } else if (domains.length) {
    recentContent = (
      <div className="space-y-1">
        {domains.map((conversation) => {
          const active = location.pathname === `/c/${conversation.conversationId}`;
          const detail =
            conversation.stopPoint?.summary ||
            conversation.title ||
            localize('com_life_domain_resume_hint');
          return (
            <Link
              key={conversation.entryHouse}
              to={`/c/${conversation.conversationId}`}
              onClick={closeMobile}
              className={cn(
                'block border-l-2 px-3 py-2.5 transition-colors',
                active
                  ? 'border-life-cinnabar bg-life-cinnabar/5 text-text-primary'
                  : 'border-transparent text-text-secondary hover:border-life-rule hover:bg-surface-hover hover:text-text-primary',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className="block font-life-serif text-life-sm font-semibold">
                {localize(PUBLIC_MAP_LABEL_KEYS[conversation.entryHouse])}
              </span>
              <span className="mt-0.5 block truncate font-life-kai text-life-meta leading-5 text-text-secondary">
                {detail}
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-4">
      <div className="px-2 pb-5">
        <p className="font-life-mono text-life-meta tracking-[0.24em] text-life-moss dark:text-[#D98A76]">
          {localize('com_life_brand_eyebrow')}
        </p>
        <p className="mt-1 font-life-serif text-life-lead font-black text-text-primary">
          {localize('com_life_brand')}
        </p>
      </div>

      <div className="space-y-0.5" aria-label={localize('com_life_primary_navigation')}>
        {links.map((item) => {
          const active =
            item.href === '/resume'
              ? location.pathname === '/resume' || location.pathname.startsWith('/c/')
              : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={closeMobile}
              className={cn(
                'flex min-h-11 items-center gap-3 border-l-2 px-3 font-life-sans text-life-sm transition-colors',
                active
                  ? 'border-life-cinnabar bg-life-cinnabar/5 font-medium text-text-primary'
                  : 'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {localize(item.label)}
            </Link>
          );
        })}
      </div>

      <div className="mx-2 my-5 border-t border-life-rule dark:border-border-light" />
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <Link
          to="/home?new=1"
          onClick={closeMobile}
          className="mb-4 flex min-h-11 items-center justify-center gap-2 border border-dashed border-life-moss/60 px-3 font-life-sans text-life-sm text-life-moss transition hover:bg-life-moss hover:text-life-paper dark:border-emerald-700/60 dark:text-emerald-400 dark:hover:bg-emerald-800 dark:hover:text-white"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {localize('com_life_new_conversation')}
        </Link>
        <p className="mb-5 px-1 font-life-kai text-life-meta leading-5 text-text-secondary">
          {localize('com_life_new_matter_sidebar_help')}
        </p>
        <p className="mb-3 font-life-mono text-life-meta tracking-[0.16em] text-text-secondary">
          {localize('com_life_recent_conversations')}
        </p>
        {recentContent}
      </div>
    </div>
  );
}
