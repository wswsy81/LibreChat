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

const baseProjection = {
  schemaVersion: 1,
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
  subtreeRevisions: {
    self: 'self_1234567890abcdef1234',
    birth: 'birth_1234567890abcdef1234',
    currentState: 'state_1234567890abcdef1234',
    pending: 'pending_1234567890abcdef1234',
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
  useLifeDossierAnnotateMutation: () => ({
    mutate: mockAnnotate,
    isLoading: false,
  }),
}));

jest.mock('../../components/BasicsForm', () => () => <div data-testid="basics-form" />);
jest.mock('../../components/PageState', () => ({
  LifeError: () => <div data-testid="error" />,
  LifeLoading: () => <div data-testid="loading" />,
}));

const renderMe = (path = '/me') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MeRoute />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectionQuery = {
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    data: {
      schemaVersion: 1,
      projection: baseProjection,
      availability: { birthDraft: 'not_provided' },
    },
  };
  mockBootstrapQuery = { isLoading: false, data: { unscopedConversations: [] } };
});

test('已有直接聊天但尚无人物观察时明确告诉用户对话已保存并可返回', () => {
  mockBootstrapQuery = {
    isLoading: false,
    data: {
      unscopedConversations: [{ conversationId: 'direct-long-chat', title: '刚才聊过的选择' }],
    },
  };

  renderMe();

  expect(screen.getByText('com_life_me_saved_title')).toBeInTheDocument();
  expect(screen.getByText('com_life_me_saved_help')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_me_resume_saved_chat/ })).toHaveAttribute(
    'href',
    '/c/direct-long-chat',
  );
});

test('完全无资料仍明确可以直接开始，不生成公式或三张空卡', () => {
  renderMe();

  expect(screen.getByText('com_life_me_empty_title')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_me_direct_chat/ })).toHaveAttribute(
    'href',
    '/c/new',
  );
  expect(screen.getByRole('link', { name: /com_life_me_add_birth/ })).toHaveAttribute(
    'href',
    '/me#me-basics',
  );
  expect(screen.queryByText('com_life_me_birth_sun')).not.toBeInTheDocument();
  expect(screen.queryByText('com_life_me_formula_confirmed')).not.toBeInTheDocument();
  expect(screen.getByTestId('basics-form')).toBeInTheDocument();
});

test('部分生辰只展示可靠字段和候选，不拼残缺公式；待判断可以认领', async () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 1,
      availability: { birthDraft: 'ready' },
      projection: {
        ...baseProjection,
        confirmed: [
          {
            id: 'dossier:traits:owned-1',
            section: 'traits',
            text: '先把选项造出来再选择。',
            status: 'confirmed',
            sourceIds: ['message:1'],
          },
        ],
        pending: [
          {
            id: 'dossier:scenes:pending-1',
            section: 'scenes',
            text: '接近交付时会回头重做系统。',
            status: 'pending',
            sourceIds: ['message:2'],
          },
        ],
        birthDraft: {
          status: 'partial',
          missingFields: ['time', 'place'],
          formula: null,
          sun: { certainty: 'exact', name: '隐士', sign: '摩羯', meaning: '核心驱动' },
          moon: {
            certainty: 'candidate',
            candidates: ['天蝎／侦探', '射手／吉普赛人'],
            meaning: '内在需要',
          },
          rising: unavailableField('对外方式'),
        },
      },
    },
  };

  renderMe();

  expect(screen.getByText('摩羯／隐士')).toBeInTheDocument();
  expect(screen.getByText('天蝎／侦探 · 射手／吉普赛人')).toBeInTheDocument();
  expect(screen.getByText('com_life_me_birth_unavailable')).toBeInTheDocument();
  expect(screen.queryByText(/一个隐士/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /com_life_me_like_me/ }));
  expect(mockAnnotate).toHaveBeenCalledWith(
    { section: 'scenes', entryId: 'pending-1', action: 'keep' },
    expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
  );
});

test('同小节近义人物认识可由用户显式合并，来源条目不静默删除', async () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 1,
      availability: { birthDraft: 'not_provided' },
      projection: {
        ...baseProjection,
        coreTensions: [
          {
            id: 'dossier:tensions:tension-1',
            section: 'tensions',
            text: '喜欢当前所做的事，但没有收入会焦虑。',
            status: 'confirmed',
            sourceIds: ['message:1'],
          },
          {
            id: 'dossier:tensions:tension-2',
            section: 'tensions',
            text: '喜欢研究框架，但不确定能否赚钱会焦虑。',
            status: 'confirmed',
            sourceIds: ['message:2'],
          },
        ],
      },
    },
  };
  renderMe();

  await userEvent.click(screen.getByRole('button', { name: 'com_life_me_merge_previous' }));
  expect(mockAnnotate).toHaveBeenCalledWith(
    {
      section: 'tensions',
      entryId: 'tension-2',
      action: 'merge',
      targetEntryId: 'tension-1',
    },
    expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
  );
});

test('三项 exact 才显示完整出生公式，并保持它是出生初稿', () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 1,
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

  renderMe();

  expect(screen.getByText('一个隐士，有着侦探的内核，戴着见证人的工作面具。')).toBeInTheDocument();
  expect(screen.getByText('com_life_me_birth_complete_help')).toBeInTheDocument();
  expect(screen.queryByText('com_life_me_empty_title')).not.toBeInTheDocument();
});

test('出生计算暂时失败只降级出生层，不伪装成完全无资料', () => {
  mockProjectionQuery = {
    ...mockProjectionQuery,
    data: {
      schemaVersion: 1,
      projection: baseProjection,
      availability: { birthDraft: 'temporarily_unavailable' },
    },
  };

  renderMe();

  expect(screen.getByText('com_life_me_birth_temporarily_unavailable')).toBeInTheDocument();
  expect(screen.queryByText('com_life_me_empty_title')).not.toBeInTheDocument();
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
