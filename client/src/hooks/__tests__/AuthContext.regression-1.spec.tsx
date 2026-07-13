/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RecoilRoot } from 'recoil';

import { AuthContextProvider, useAuthContext } from '../AuthContext';

const mockRefresh = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useLoginUserMutation: jest.fn(() => ({ mutate: jest.fn() })),
  useLogoutUserMutation: jest.fn(() => ({ mutate: jest.fn() })),
  useRefreshTokenMutation: jest.fn(() => ({ mutate: mockRefresh })),
  useGetUserQuery: jest.fn(() => ({ data: undefined, isError: false, error: null })),
  useGetRole: jest.fn(() => ({ data: null })),
  useListRoles: jest.fn(() => ({ data: undefined })),
}));

function Status() {
  const { isAuthenticated, isAuthReady } = useAuthContext();
  return (
    <div
      data-testid="status"
      data-authenticated={String(isAuthenticated)}
      data-ready={String(isAuthReady)}
    />
  );
}

describe('AuthContextProvider refresh readiness', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes readiness only when the refreshed user and token are installed', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <RecoilRoot>
          <MemoryRouter>
            <AuthContextProvider allowAnonymous>
              <Status />
            </AuthContextProvider>
          </MemoryRouter>
        </RecoilRoot>
      </QueryClientProvider>,
    );

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    const [, options] = mockRefresh.mock.calls[0] as [
      unknown,
      { onSuccess: (data: unknown) => void },
    ];

    act(() => {
      options.onSuccess({ user: { id: '1', role: 'USER' }, token: 'fresh-token' });
    });

    expect(screen.getByTestId('status')).toHaveAttribute('data-ready', 'false');
    expect(screen.getByTestId('status')).toHaveAttribute('data-authenticated', 'false');

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(screen.getByTestId('status')).toHaveAttribute('data-ready', 'true');
    expect(screen.getByTestId('status')).toHaveAttribute('data-authenticated', 'true');
  });
});
