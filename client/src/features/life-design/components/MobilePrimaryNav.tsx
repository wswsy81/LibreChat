import { Home, Map, MessageCircleMore, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const items = [
  { href: '/home', label: 'com_life_nav_today', icon: Home },
  { href: '/c/new', label: 'com_life_nav_direct', icon: MessageCircleMore },
  { href: '/map', label: 'com_life_nav_map', icon: Map },
  { href: '/me', label: 'com_life_nav_me', icon: UserRound },
] as const;

export default function MobilePrimaryNav() {
  const localize = useLocalize();
  const location = useLocation();

  return (
    <nav
      aria-label={localize('com_life_primary_navigation')}
      className="grid shrink-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1.5fr)_minmax(0,0.5fr)] border-t border-life-rule bg-life-paper pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active =
          item.href === '/c/new'
            ? location.pathname === '/resume' || location.pathname.startsWith('/c/')
            : location.pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 whitespace-nowrap border-t-2 font-life-sans text-life-meta leading-none',
              active
                ? 'border-life-cinnabar text-life-ink'
                : 'border-transparent text-life-muted hover:text-life-ink',
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {localize(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}
