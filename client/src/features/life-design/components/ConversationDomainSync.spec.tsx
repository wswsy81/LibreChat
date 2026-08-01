import { MemoryRouter } from 'react-router-dom';
import { act, render, waitFor } from '@testing-library/react';
import { useLifeBootstrapQuery, useLifeOnboardingMutation } from '~/data-provider';
import ConversationDomainSync from './ConversationDomainSync';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { useAuthContext } from '~/hooks/AuthContext';

jest.mock('~/data-provider');
jest.mock('~/hooks/AuthContext');
jest.mock('~/hooks/useLocalize', () => () => (key: string) => key);
jest.mock('../hooks/useUnifiedShell');

const mockBootstrap = useLifeBootstrapQuery as jest.MockedFunction<typeof useLifeBootstrapQuery>;
const mockOnboarding = useLifeOnboardingMutation as jest.MockedFunction<
  typeof useLifeOnboardingMutation
>;
const mockAuth = useAuthContext as jest.MockedFunction<typeof useAuthContext>;
const mockUnifiedShell = useUnifiedShell as jest.MockedFunction<typeof useUnifiedShell>;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockReturnValue({
    isAuthenticated: true,
    user: { id: 'user-a', name: '账户名' },
  } as ReturnType<typeof useAuthContext>);
  mockUnifiedShell.mockReturnValue({ enabled: true, isLoading: false });
});

test('直接打开旧领域会话时只激活对应领域，不改当前 route', async () => {
  const mutate = jest.fn();
  mockBootstrap.mockReturnValue({
    data: {
      activeHouse: 'h6',
      summary: { alias: '原档案名' },
      domainConversations: [{ entryHouse: 'h2', conversationId: 'money-conversation' }],
    },
  } as ReturnType<typeof useLifeBootstrapQuery>);
  mockOnboarding.mockReturnValue({ mutate, isLoading: false } as unknown as ReturnType<
    typeof useLifeOnboardingMutation
  >);

  const view = render(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(mutate).toHaveBeenCalledWith(
      { archiveName: '原档案名', entryHouse: 'h2' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
  act(() => mutate.mock.calls[0][1].onSuccess());
  view.rerender(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );
  expect(mutate).toHaveBeenCalledTimes(1);
});

test('旧领域自动激活首次 503 后受控重试，成功后才标记完成', async () => {
  jest.useFakeTimers();
  const mutate = jest.fn();
  mockBootstrap.mockReturnValue({
    data: {
      activeHouse: 'h6',
      summary: { alias: '原档案名' },
      domainConversations: [{ entryHouse: 'h2', conversationId: 'money-conversation' }],
    },
  } as ReturnType<typeof useLifeBootstrapQuery>);
  mockOnboarding.mockReturnValue({ mutate, isLoading: false } as unknown as ReturnType<
    typeof useLifeOnboardingMutation
  >);

  const view = render(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );
  expect(mutate).toHaveBeenCalledTimes(1);
  act(() => mutate.mock.calls[0][1].onError(new Error('503')));
  act(() => jest.advanceTimersByTime(900));
  expect(mutate).toHaveBeenCalledTimes(2);
  act(() => mutate.mock.calls[1][1].onSuccess());
  act(() => jest.advanceTimersByTime(900));
  view.rerender(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );
  expect(mutate).toHaveBeenCalledTimes(2);
  view.unmount();
  jest.useRealTimers();
});

test('旧领域自动激活耗尽三次重试后停止，不因 mutation 重渲染形成死循环', () => {
  jest.useFakeTimers();
  const mutate = jest.fn();
  const onboarding = { mutate, isLoading: false } as unknown as ReturnType<
    typeof useLifeOnboardingMutation
  >;
  mockBootstrap.mockReturnValue({
    data: {
      activeHouse: 'h6',
      summary: { alias: '原档案名' },
      domainConversations: [{ entryHouse: 'h2', conversationId: 'money-conversation' }],
    },
  } as ReturnType<typeof useLifeBootstrapQuery>);
  mockOnboarding.mockReturnValue(onboarding);

  const view = render(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );
  for (let index = 0; index < 4; index += 1) {
    act(() => mutate.mock.calls[index][1].onError(new Error('503')));
    view.rerender(
      <MemoryRouter initialEntries={['/c/money-conversation']}>
        <ConversationDomainSync />
      </MemoryRouter>,
    );
    if (index < 3) act(() => jest.advanceTimersByTime(900));
  }
  view.rerender(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );

  expect(mutate).toHaveBeenCalledTimes(4);
  view.unmount();
  jest.useRealTimers();
});

test('会话领域已经激活时不重复写入', () => {
  const mutate = jest.fn();
  mockBootstrap.mockReturnValue({
    data: {
      activeHouse: 'h2',
      domainConversations: [{ entryHouse: 'h2', conversationId: 'money-conversation' }],
    },
  } as ReturnType<typeof useLifeBootstrapQuery>);
  mockOnboarding.mockReturnValue({ mutate, isLoading: false } as unknown as ReturnType<
    typeof useLifeOnboardingMutation
  >);

  render(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );

  expect(mutate).not.toHaveBeenCalled();
});
