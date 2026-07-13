/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryKeys, request } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useRefreshTokenMutation } from './mutations';

describe('useRefreshTokenMutation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves startup config while clearing user-scoped queries', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const startupKey = [QueryKeys.startupConfig, false, 'default'];
    const privateKey = [QueryKeys.conversation, 'private-conversation'];
    const startupConfig = { lifeUnifiedShell: true };

    client.setQueryData(startupKey, startupConfig);
    client.setQueryData(privateKey, { conversationId: 'private-conversation' });
    jest.spyOn(request, 'refreshToken').mockResolvedValue(undefined);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRefreshTokenMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(client.getQueryData(startupKey)).toEqual(startupConfig);
    expect(client.getQueryData(privateKey)).toBeUndefined();
  });
});
