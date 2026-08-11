/**
 * @jest-environment @happy-dom/jest-environment
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import MobileSidebarHeader from './MobileSidebarHeader';

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: ({ showLabel }: { showLabel?: boolean }) => (
    <button type="button">{showLabel ? '打开侧边栏' : '图标入口'}</button>
  ),
}));

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileSidebarHeader />
    </MemoryRouter>,
  );
}

test.each(['/home', '/me'])('在非聊天移动页面 %s 显示带文字的侧边栏入口', (pathname) => {
  renderAt(pathname);

  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开侧边栏' })).toBeInTheDocument();
});

test.each(['/c', '/c/new', '/c/conversation-id'])(
  '在聊天页面 %s 不重复渲染侧边栏入口',
  (pathname) => {
    renderAt(pathname);

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  },
);
