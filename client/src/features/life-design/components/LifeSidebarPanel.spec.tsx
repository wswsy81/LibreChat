/**
 * @jest-environment @happy-dom/jest-environment
 */
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import LifeSidebarPanel from './LifeSidebarPanel';

const mockSetSidebarExpanded = jest.fn();
let mockBootstrap: Record<string, unknown> = { isLoading: false };

jest.mock('recoil', () => ({
  useRecoilState: () => [true, mockSetSidebarExpanded],
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { sidebarExpanded: {} },
}));

jest.mock('~/data-provider', () => ({
  useLifeBootstrapQuery: () => mockBootstrap,
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: true }),
  useLocalize: () => (key: string) => key,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockBootstrap = {
    isLoading: false,
    data: {
      domainConversations: [
        {
          entryHouse: 'h6',
          conversationId: 'work-conversation',
          title: '工作上的选择',
          stopPoint: { summary: '停在要不要接下这份新工作' },
        },
        {
          entryHouse: 'h2',
          conversationId: 'money-conversation',
          title: '未来三个月现金流',
          stopPoint: null,
        },
      ],
      unscopedConversations: [],
    },
  };
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
});

test('侧栏显示已经保存但尚未归入生活地图的直接聊天', () => {
  mockBootstrap = {
    isLoading: false,
    data: {
      domainConversations: [],
      unscopedConversations: [
        {
          conversationId: 'direct-long-chat',
          title: '刚才聊过的选择',
        },
      ],
    },
  };

  render(
    <MemoryRouter initialEntries={['/home']}>
      <LifeSidebarPanel />
    </MemoryRouter>,
  );

  expect(screen.getByText('com_life_unscoped_conversation')).toBeInTheDocument();
  expect(screen.getByText('刚才聊过的选择')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /刚才聊过的选择/ })).toHaveAttribute(
    'href',
    '/c/direct-long-chat',
  );
  expect(screen.queryByText('com_life_no_recent_conversations')).toBeNull();
});

test('侧栏把“开启新对话”收口为“说件新事”的领域入口', () => {
  render(
    <MemoryRouter initialEntries={['/home']}>
      <LifeSidebarPanel />
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /com_life_new_conversation/ })).toHaveAttribute(
    'href',
    '/home?new=1',
  );
  expect(screen.queryByRole('link', { name: /com_life_untitled_conversation/ })).toBeNull();
  expect(screen.getByText('com_life_recent_conversations')).toBeInTheDocument();
});

test('侧栏只列聊过的领域，并优先显示各领域自己的停点', () => {
  render(
    <MemoryRouter initialEntries={['/c/work-conversation']}>
      <LifeSidebarPanel />
    </MemoryRouter>,
  );

  expect(screen.getByText('com_life_map_house_h6')).toBeInTheDocument();
  expect(screen.getByText('停在要不要接下这份新工作')).toBeInTheDocument();
  expect(screen.getByText('com_life_map_house_h2')).toBeInTheDocument();
  expect(screen.getByText('未来三个月现金流')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_map_house_h6/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: /com_life_map_house_h2/ })).toHaveAttribute(
    'href',
    '/c/money-conversation',
  );
});

test('手机上选择“说件新事”后收起侧栏', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  render(
    <MemoryRouter initialEntries={['/home']}>
      <LifeSidebarPanel />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('link', { name: /com_life_new_conversation/ }));

  expect(mockSetSidebarExpanded).toHaveBeenCalledWith(false);
});
