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
  isConsumed: () => false,
  markConsumed: (...args: unknown[]) => mockMarkConsumed(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
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
