/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import MeRoute from '../MeRoute';

const mockAnnotate = jest.fn();
const mockToast = jest.fn();
const mockRefetch = jest.fn();
let mockProjectionQuery: Record<string, unknown>;
let mockBootstrapQuery: Record<string, unknown>;

const unavailableField = (meaning: string) => ({
  certainty: 'unavailable',
  name: null,
  sign: null,
  meaning,
});

const emptyChapters = () => ({ actor: [], agent: [], author: [], dynamics: [], becoming: [] });

const baseProjection = {
  schemaVersion: 2,
  revision: 'projection_1234567890abcdef1234',
  updatedAt: null,
  selfFormula: null,
  birthDraft: {
    status: 'unavailable',
    missingFields: ['date', 'place', 'time'],
    formula: null,
    sun: unavailableField('核心驱动'),
    moon: unavailableField('内在需要'),
    rising: unavailableField('对外方式'),
  },
  currentState: null,
  coreTensions: [],
  confirmed: [],
  pending: [],
  chapters: emptyChapters(),
  stateChain: [],
  lifeWheel: null,
  subtreeRevisions: {
    self: 'self_1234567890abcdef1234',
    birth: 'birth_1234567890abcdef1234',
    currentState: 'state_1234567890abcdef1234',
    pending: 'pending_1234567890abcdef1234',
    stateChain: 'chain_1234567890abcdef1234',
  },
};

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useToastContext: () => ({ showToast: mockToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useLifeSelfProjectionQuery: () => mockProjectionQuery,
  useLifeBootstrapQuery: () => mockBootstrapQuery,
  useLifeDossierAnnotateMutation: () => ({ mutate: mockAnnotate, isLoading: false }),
}));

jest.mock('../../components/BasicsForm', () => () => <div data-testid="basics-form" />);
jest.mock('../../components/PageState', () => ({
  LifeError: () => <div data-testid="error" />,
  LifeLoading: () => <div data-testid="loading" />,
}));

const renderMe = (path = '/me', embedded = false) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MeRoute embedded={embedded} />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectionQuery = {
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    data: {
      schemaVersion: 2,
      projection: baseProjection,
      availability: { birthDraft: 'not_provided' },
    },
  };
  mockBootstrapQuery = { isLoading: false, data: { unscopedConversations: [] } };
});

test('第一层直接呈现五章，材料不足时诚实留白', () => {
  renderMe('/me', true);

  expect(screen.getByRole('heading', { name: 'com_life_me_title' })).toBeInTheDocument();
  for (const title of [
    'com_life_me_actor_title',
    'com_life_me_agent_title',
    'com_life_me_author_title',
    'com_life_me_dynamics_title',
    'com_life_me_becoming_title',
  ]) {
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  }
  expect(screen.getAllByText('com_life_me_chapter_empty')).toHaveLength(5);
  expect(screen.queryByTestId('basics-form')).not.toBeInTheDocument();
});

test('有已保存对话但尚无人物材料时，保留精确返回入口', () => {
  mockBootstrapQuery = {
    isLoading: false,
    data: {
      unscopedConversations: [{ conversationId: 'direct-long-chat', title: '刚才聊过的选择' }],
    },
  };
  renderMe('/me', true);

  expect(screen.getByText('com_life_me_saved_help')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_me_resume_saved_chat/ })).toHaveAttribute(
    'href',
    '/c/direct-long-chat',
  );
});

test('现实试验带复盘、下一步和原会话进入“正在验证”', () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 2,
      availability: { birthDraft: 'not_provided' },
      projection: {
        ...baseProjection,
        currentState: { text: '正在测试付费意愿。', sourceIds: [], expiresAt: null },
        chapters: {
          ...emptyChapters(),
          becoming: [
            {
              id: 'experiment:exp-1',
              experimentId: 'exp-1',
              kind: 'experiment',
              text: '先发出一次明确报价。',
              status: 'needs_adjustment',
              sourceType: 'experiment',
              sourceIds: ['event-1'],
              conversationId: 'conversation-exp',
              houseIds: ['h2', 'h10'],
              firstStep: '向一位目标用户报价。',
              learning: '愿意继续聊不等于愿意付费。',
              nextAction: '下一轮测试付款动作。',
            },
          ],
        },
      },
    },
  };
  renderMe('/me', true);

  expect(screen.getByText('先发出一次明确报价。')).toBeInTheDocument();
  expect(screen.getByText('愿意继续聊不等于愿意付费。')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_me_open_experiment/ })).toHaveAttribute(
    'href',
    '/c/conversation-exp',
  );
});

test('待判断只在“正在验证”出现，可由用户认领', async () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 2,
      availability: { birthDraft: 'not_provided' },
      projection: {
        ...baseProjection,
        chapters: {
          ...emptyChapters(),
          becoming: [
            {
              id: 'dossier:scenes:pending-1',
              kind: 'hypothesis',
              text: '接近交付时会回头重做系统。',
              status: 'pending',
              sourceType: 'dossier',
              sourceIds: ['message:2'],
              dossierRef: { section: 'scenes', entryId: 'pending-1' },
            },
          ],
        },
      },
    },
  };
  renderMe('/me', true);

  await userEvent.click(screen.getByRole('button', { name: /com_life_me_like_me/ }));
  expect(mockAnnotate).toHaveBeenCalledWith(
    { section: 'scenes', entryId: 'pending-1', action: 'keep' },
    expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
  );
});

test('五章正文不渲染出生内容，也不生成出生人物公式', () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 2,
      availability: { birthDraft: 'ready' },
      projection: {
        ...baseProjection,
        birthDraft: {
          status: 'complete',
          missingFields: [],
          formula: '一个隐士，有着侦探的内核，戴着见证人的工作面具。',
          sun: { certainty: 'exact', name: '隐士', sign: '摩羯', meaning: '核心驱动' },
          moon: { certainty: 'exact', name: '侦探', sign: '天蝎', meaning: '内在需要' },
          rising: { certainty: 'exact', name: '见证人', sign: '双子', meaning: '对外方式' },
        },
      },
    },
  };
  renderMe('/me', true);

  expect(screen.queryByText('com_life_me_birth_reference_notice')).not.toBeInTheDocument();
  expect(screen.queryByText('摩羯／隐士')).not.toBeInTheDocument();
  expect(screen.queryByText(/一个隐士/)).not.toBeInTheDocument();
});

test('查询加载和失败各有独立页面状态', () => {
  mockProjectionQuery = { isLoading: true };
  const loading = renderMe();
  expect(screen.getByTestId('loading')).toBeInTheDocument();
  loading.unmount();

  mockProjectionQuery = { isLoading: false, isError: true, refetch: mockRefetch };
  renderMe();
  expect(screen.getByTestId('error')).toBeInTheDocument();
});
