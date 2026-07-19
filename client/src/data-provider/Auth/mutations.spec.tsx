/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryKeys, dataService, request } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import type { ReactNode } from 'react';

import { useLoginUserMutation, useLogoutUserMutation, useRefreshTokenMutation } from './mutations';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      login: jest.fn(),
      logout: jest.fn(),
    },
    request: {
      ...actual.request,
      refreshToken: jest.fn(),
    },
  };
});

function setupQueryState() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const startupKey = [QueryKeys.startupConfig, false, 'default'];
  const privateKey = [QueryKeys.conversation, 'private-conversation'];
  const startupConfig = { lifeUnifiedShell: true };

  client.setQueryData(startupKey, startupConfig);
  client.setQueryData(privateKey, { conversationId: 'private-conversation' });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RecoilRoot>{children}</RecoilRoot>
    </QueryClientProvider>
  );

  return { client, startupKey, privateKey, startupConfig, wrapper };
}

function expectOnlyStartupConfig({ client, startupKey, privateKey, startupConfig }) {
  expect(client.getQueryData(startupKey)).toEqual(startupConfig);
  expect(client.getQueryData(privateKey)).toBeUndefined();
}

describe('authentication mutations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('refresh preserves startup config while clearing user-scoped queries', async () => {
    const state = setupQueryState();
    (request.refreshToken as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshTokenMutation(), { wrapper: state.wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expectOnlyStartupConfig(state);
  });

  it('login preserves startup config while clearing user-scoped queries', async () => {
    const state = setupQueryState();
    (dataService.login as jest.Mock).mockResolvedValue({ token: 'login-token' });
    const { result } = renderHook(() => useLoginUserMutation(), { wrapper: state.wrapper });

    await act(async () => {
      await result.current.mutateAsync({ email: 'new@example.test', password: 'Test1234!' });
    });

    expectOnlyStartupConfig(state);
  });

  it('logout preserves startup config while clearing user-scoped queries', async () => {
    const state = setupQueryState();
    (dataService.logout as jest.Mock).mockResolvedValue({});
    const { result } = renderHook(() => useLogoutUserMutation(), { wrapper: state.wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expectOnlyStartupConfig(state);
  });
});
