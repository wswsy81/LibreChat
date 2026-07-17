import { useCallback, useMemo } from 'react';
import {
  Archive,
  Home,
  LayoutDashboard,
  MessageCircleMore,
  NotebookPen,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import type { NavLink } from '~/common';
import { LifeSidebarPanel, useUnifiedShell } from '~/features/life-design';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';

export default function useUnifiedSidebarLinks(): NavLink[] {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isAdmin = user?.role === 'ADMIN';
  const { enabled: shellEnabled } = useUnifiedShell();
  const setExpanded = useSetRecoilState(store.sidebarExpanded);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      if (window.innerWidth <= 768) {
        setExpanded(false);
      }
    },
    [navigate, setExpanded],
  );

  return useMemo<NavLink[]>(() => {
    if (!shellEnabled) {
      return [];
    }
    return [
      {
        title: 'com_life_nav_home' as const,
        icon: Home,
        id: 'life-home',
        Component: LifeSidebarPanel,
        isActive: location.pathname === '/home',
        onClick: () => go('/home'),
      },
      {
        title: 'com_life_nav_resume' as const,
        icon: MessageCircleMore,
        id: 'life-resume',
        Component: LifeSidebarPanel,
        isActive: location.pathname === '/resume' || location.pathname.startsWith('/c/'),
        onClick: () => go('/resume'),
      },
      {
        title: 'com_life_nav_inbox' as const,
        icon: NotebookPen,
        id: 'life-inbox',
        Component: LifeSidebarPanel,
        isActive: location.pathname === '/inbox',
        onClick: () => go('/inbox'),
      },
      {
        title: 'com_life_nav_archive' as const,
        icon: Archive,
        id: 'life-archive',
        Component: LifeSidebarPanel,
        isActive: location.pathname === '/archive' || location.pathname.startsWith('/archive/'),
        onClick: () => go('/archive'),
      },
      {
        title: 'com_life_nav_about' as const,
        icon: UserRound,
        id: 'life-about',
        Component: LifeSidebarPanel,
        isActive: location.pathname === '/about',
        onClick: () => go('/about'),
      },
      // 运营台:仅管理员可见,排在最后
      ...(isAdmin
        ? [
            {
              title: 'com_life_nav_admin' as const,
              icon: LayoutDashboard,
              id: 'life-admin',
              Component: LifeSidebarPanel,
              isActive: location.pathname === '/admin',
              onClick: () => go('/admin'),
            },
          ]
        : []),
    ];
  }, [go, location.pathname, shellEnabled, isAdmin]);
}
