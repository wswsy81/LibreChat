import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { render, screen } from '@testing-library/react';

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => true,
}));

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  return {
    __esModule: true,
    default: { sidebarExpanded: atom({ key: 'test-unified-sidebar-expanded', default: true }) },
  };
});

jest.mock('~/hooks/Nav/useUnifiedSidebarLinks', () => ({
  __esModule: true,
  default: () => [],
}));

jest.mock('~/hooks', () => ({
  useChatHelpers: () => ({}),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => {
  const React = jest.requireActual('react');
  return {
    ChatContext: React.createContext({}),
    ChatFormProvider: ({ children }: { children: React.ReactNode }) => children,
    ActivePanelProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('~/components/SidePanel/Nav', () => ({
  __esModule: true,
  default: () => <div data-testid="side-panel-nav" />,
}));

jest.mock('../ExpandedPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="expanded-panel" />,
}));

jest.mock('../Sidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="desktop-sidebar" />,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

import { UnifiedSidebar } from '../UnifiedSidebar';
import store from '~/store';

function SidebarState() {
  const expanded = useRecoilValue(store.sidebarExpanded);
  return <output data-testid="sidebar-state">{String(expanded)}</output>;
}

test('手机窄屏首次挂载强制收起上次持久化的抽屉状态', () => {
  render(
    <RecoilRoot initializeState={({ set }) => set(store.sidebarExpanded, true)}>
      <UnifiedSidebar />
      <SidebarState />
    </RecoilRoot>,
  );

  expect(screen.getByTestId('sidebar-state')).toHaveTextContent('false');
  expect(screen.getByTestId('expanded-panel').parentElement).toHaveClass('-translate-x-full');
});
