/**
 * @jest-environment @happy-dom/jest-environment
 */
import { act, renderHook } from '@testing-library/react';
import type { LifeOnboardingResponse } from 'librechat-data-provider';
import useHouseEntry from './useEntry';

const mockMutate = jest.fn();
const mockNavigate = jest.fn();
const mockTrack = jest.fn();
const mockMarkConsumed = jest.fn();
const mockIsConsumed = jest.fn((_key: string) => false);

jest.mock('~/data-provider', () => ({
  useLifeOnboardingMutation: () => ({
    mutate: mockMutate,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/utils/track', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

jest.mock('../oneShot', () => ({
  isConsumed: (key: string) => mockIsConsumed(key),
  markConsumed: (key: string) => mockMarkConsumed(key),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConsumed.mockReturnValue(false);
  sessionStorage.clear();
});

test('successful return entry clears the stored selection and records reentry', () => {
  sessionStorage.setItem('life_entry_house', 'h6');
  const { result } = renderHook(() => useHouseEntry());

  act(() => {
    result.current.enterHouse({ archiveName: '修文', entryHouse: 'h6' });
  });

  const callbacks = mockMutate.mock.calls[0][1] as {
    onSuccess: (response: LifeOnboardingResponse) => void;
  };
  act(() => {
    callbacks.onSuccess({
      ok: true,
      profileVersion: 'v2',
      applied: 0,
      action: 'new',
      conversationId: null,
      entryEvent: {
        kind: 'house_entered',
        entryHouse: 'h6',
        visitMode: 'return_entry',
        at: '2026-07-24T12:00:00.000Z',
      },
      prompt: '[trigger:house_entered]',
      route: '/c/new?prompt=house',
      operationId: 'operation-1',
    });
  });

  expect(sessionStorage.getItem('life_entry_house')).toBeNull();
  expect(mockTrack).toHaveBeenCalledWith('house_reentered', {
    house: 'h6',
    visitMode: 'return_entry',
  });
  expect(mockMarkConsumed).toHaveBeenCalledWith('life:onboarding:operation-1');
  expect(mockNavigate).toHaveBeenCalledWith('/c/new?prompt=house', { replace: true });
});

test('restored domain goes straight back to its page without consuming a new-page marker', () => {
  const { result } = renderHook(() => useHouseEntry());

  act(() => {
    result.current.enterHouse({ archiveName: '修文', entryHouse: 'h2' });
  });

  const callbacks = mockMutate.mock.calls[0][1] as {
    onSuccess: (response: LifeOnboardingResponse) => void;
  };
  act(() => {
    callbacks.onSuccess({
      ok: true,
      profileVersion: 'v2',
      applied: 0,
      action: 'restored',
      conversationId: 'money-conversation',
      entryEvent: {
        kind: 'house_entered',
        entryHouse: 'h2',
        visitMode: 'continue',
        at: '2026-08-01T12:00:00.000Z',
      },
      prompt: '',
      route: '/c/money-conversation',
      operationId: null,
    });
  });

  expect(mockMarkConsumed).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('/c/money-conversation', { replace: true });
});

test('a replayed new-page result waits for the first tab instead of creating a duplicate domain page', () => {
  jest.useFakeTimers();
  const { result, unmount } = renderHook(() => useHouseEntry());

  act(() => {
    result.current.enterHouse({ archiveName: '修文', entryHouse: 'h2' });
  });
  const firstCallbacks = mockMutate.mock.calls[0][1] as {
    onSuccess: (response: LifeOnboardingResponse) => void;
  };
  act(() => {
    firstCallbacks.onSuccess({
      ok: true,
      profileVersion: 'v2',
      applied: 0,
      action: 'new',
      conversationId: null,
      entryEvent: {
        kind: 'house_entered',
        entryHouse: 'h2',
        visitMode: 'first_entry',
        at: '2026-08-01T12:00:00.000Z',
      },
      prompt: '[trigger:house_entered]',
      route: '/c/new?prompt=money',
      operationId: 'shared-operation',
      replayed: true,
    });
  });

  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockMarkConsumed).not.toHaveBeenCalled();
  expect(mockMutate).toHaveBeenCalledTimes(1);
  act(() => {
    jest.advanceTimersByTime(900);
  });
  expect(mockMutate).toHaveBeenCalledTimes(2);

  unmount();
  jest.useRealTimers();
});

test('replayed reservation 超过受控重试后转入权威 resume，不退回首页猜测', () => {
  jest.useFakeTimers();
  const { result, unmount } = renderHook(() => useHouseEntry());
  const replay: LifeOnboardingResponse = {
    ok: true,
    profileVersion: 'v2',
    applied: 0,
    action: 'new' as const,
    conversationId: null,
    entryEvent: {
      kind: 'house_entered' as const,
      entryHouse: 'h2',
      visitMode: 'first_entry' as const,
      at: '2026-08-01T12:00:00.000Z',
    },
    prompt: '[trigger:house_entered]',
    route: '/c/new?prompt=money',
    operationId: 'shared-operation',
    replayed: true,
  };

  act(() => result.current.enterHouse({ archiveName: '修文', entryHouse: 'h2' }));
  for (let index = 0; index < 4; index += 1) {
    const callbacks = mockMutate.mock.calls[index][1] as {
      onSuccess: (response: LifeOnboardingResponse) => void;
    };
    act(() => callbacks.onSuccess(replay));
    if (index < 3) act(() => jest.advanceTimersByTime(900));
  }

  expect(mockNavigate).toHaveBeenCalledWith('/resume', { replace: true });
  expect(mockNavigate).not.toHaveBeenCalledWith('/home?new=1', { replace: true });
  unmount();
  jest.useRealTimers();
});
