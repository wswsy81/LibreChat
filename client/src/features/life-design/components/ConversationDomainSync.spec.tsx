import { MemoryRouter } from 'react-router-dom';
import { render, waitFor } from '@testing-library/react';
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
    expect(mutate).toHaveBeenCalledWith({ archiveName: '原档案名', entryHouse: 'h2' });
  });
  view.rerender(
    <MemoryRouter initialEntries={['/c/money-conversation']}>
      <ConversationDomainSync />
    </MemoryRouter>,
  );
  expect(mutate).toHaveBeenCalledTimes(1);
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
