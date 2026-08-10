/**
 * @jest-environment @happy-dom/jest-environment
 */
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LifeBootstrapResponse } from 'librechat-data-provider';
import ReturningHome from './ReturningHome';

const mockLogout = jest.fn();
const mockEnter = jest.fn();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/data-provider', () => ({
  useLifeArchiveQuery: () => ({
    data: {
      profile: {
        updatedAt: '2026-07-17T01:30:39.981Z',
        signals: [],
        timeline: [
          {
            when: '两周前至今',
            what: '顾问工作结束后仍在推进自己的系统',
            source: '用户本轮陈述',
          },
        ],
      },
      reports: [],
    },
    isLoading: false,
    isError: false,
  }),
  useLifeInboxMutation: () => ({
    mutate: jest.fn(),
    isLoading: false,
    isSuccess: false,
  }),
  useLifeSelfProjectionQuery: () => ({
    data: {
      schemaVersion: 1,
      availability: { birthDraft: 'not_provided' },
      projection: {
        schemaVersion: 1,
        revision: 'projection_1234567890abcdef1234',
        updatedAt: '2026-08-09T14:18:06.675Z',
        selfFormula: null,
        birthDraft: {
          status: 'unavailable',
          missingFields: ['date', 'time', 'city'],
          formula: null,
          sun: { certainty: 'unavailable', name: null, sign: null, meaning: '暂缺' },
          moon: { certainty: 'unavailable', name: null, sign: null, meaning: '暂缺' },
          rising: { certainty: 'unavailable', name: null, sign: null, meaning: '暂缺' },
        },
        currentState: null,
        coreTensions: [],
        confirmed: [],
        pending: [
          {
            id: 'dossier:traits:pending-1',
            section: 'traits',
            text: '习惯先把具体选项做出来，再从结果中选择。',
            status: 'pending',
            sourceIds: ['message-1'],
          },
        ],
        subtreeRevisions: {
          self: 'self_1234567890abcdef1234',
          birth: 'birth_1234567890abcdef1234',
          currentState: 'current_1234567890abcdef1234',
          pending: 'pending_1234567890abcdef1234',
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
  useLifeOnboardingMutation: () => ({
    mutate: mockEnter,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ logout: mockLogout }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils/track', () => ({ track: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
});

const bootstrap: LifeBootstrapResponse = {
  authenticated: true,
  user: { id: 'user-1', name: '修文测试1' },
  profileState: 'ready',
  hasSubstantiveProfile: true,
  summary: {
    alias: '修文测试1',
    lastSurface: '当前真问题',
    lifeWheel: {
      schemaVersion: 1,
      lanternHouse: 'h6',
      houses: [
        {
          id: 'h6',
          publicName: '工作与健康',
          startAngleDeg: 30,
          endAngleDeg: 0,
          centerAngleDeg: 15,
          sweepDeg: -30,
          axisBoundary: false,
          recognition: 'owned',
          condition: {
            currentSnapshotId: 'snapshot-1',
            level: 'strained',
            status: 'user_confirmed',
            trend: 'improving',
            asOf: '2026-07-24T10:00:00.000Z',
            evidenceSummary: '每天都在救火',
          },
        },
      ],
    },
  },
  domainConversations: [{ entryHouse: 'h6', conversationId: 'work-conversation' }],
  recommendedRoute: '/resume',
};

test('renders a natural-language timeline date without crashing the returning home page', () => {
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={bootstrap} />
    </MemoryRouter>,
  );

  expect(screen.getByText('两周前至今')).toBeInTheDocument();
  expect(screen.getByText('顾问工作结束后仍在推进自己的系统')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 3, name: 'com_life_map_house_h6' }),
  ).toBeInTheDocument();
  expect(screen.getByText('com_life_condition_strained')).toBeInTheDocument();
  expect(screen.getByText('com_life_trend_improving')).toBeInTheDocument();
  expect(screen.getByText('com_life_testing_now')).toBeInTheDocument();
  expect(screen.getByText('com_life_home_self_title')).toBeInTheDocument();
  expect(screen.getByText('习惯先把具体选项做出来，再从结果中选择。')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_home_self_link/ })).toHaveAttribute(
    'href',
    '/me',
  );
});

test('老用户点击当前亮灯领域时由领域入口恢复它自己的长期会话', () => {
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={bootstrap} />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getAllByRole('button', { name: /com_life_continue_here/ })[1]);

  expect(mockEnter).toHaveBeenCalledWith(
    { archiveName: '修文测试1', entryHouse: 'h6' },
    expect.any(Object),
  );
});

test('老用户可从首页进入“说件新事”的领域选择', () => {
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={bootstrap} />
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /com_life_start_new_archive/ })).toHaveAttribute(
    'href',
    '/home?new=1',
  );
  expect(screen.getByRole('link', { name: /com_life_free_chat_action/ })).toHaveAttribute(
    'href',
    '/c/new',
  );
});

test('桌面主操作与随手记属于同一左栏内容流，不再被右栏卡片撑出空洞', () => {
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={bootstrap} />
    </MemoryRouter>,
  );

  const mainColumn = screen.getByTestId('home-main-column');
  expect(mainColumn).toContainElement(screen.getByText(/com_life_last_time/));
  expect(mainColumn).toContainElement(screen.getByText('com_life_quick_capture'));
  expect(mainColumn).not.toContainElement(screen.getByText('com_life_testing_now'));
});

test('今天页优先展示当前共同议题、最多三项未知并精确续接原会话', () => {
  const withThread = {
    ...bootstrap,
    currentWorkingThread: {
      conversationId: 'conversation/with space',
      title: '重新设计工作和生活',
      status: 'open_goal' as const,
      keyUnknowns: [
        '我真正喜欢的工作体验',
        '最低现金流约束',
        '生活里必须保留什么',
        '第四项不应展示',
      ],
      updatedAt: '2026-08-10T12:00:00.000Z',
      facilitatorNext: '内部主持字段不能出现在页面上',
    },
  };
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={withThread} />
    </MemoryRouter>,
  );

  expect(screen.getByText(/com_life_current_thread/)).toBeInTheDocument();
  expect(screen.getByText('重新设计工作和生活')).toBeInTheDocument();
  expect(screen.getByText('我真正喜欢的工作体验')).toBeInTheDocument();
  expect(screen.getByText('最低现金流约束')).toBeInTheDocument();
  expect(screen.getByText('生活里必须保留什么')).toBeInTheDocument();
  expect(screen.queryByText('第四项不应展示')).not.toBeInTheDocument();
  expect(screen.queryByText('内部主持字段不能出现在页面上')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /com_life_continue_thread/ }));
  expect(mockNavigate).toHaveBeenCalledWith('/c/conversation%2Fwith%20space');
});

test('没有活动共同议题时保留旧真问题与 resume 续接行为', () => {
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={bootstrap} />
    </MemoryRouter>,
  );

  expect(screen.getByText('当前真问题')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /com_life_continue_here/ })[0]);
  expect(mockNavigate).toHaveBeenCalledWith('/resume');
});
