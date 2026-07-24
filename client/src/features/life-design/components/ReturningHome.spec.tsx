/**
 * @jest-environment @happy-dom/jest-environment
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LifeBootstrapResponse } from 'librechat-data-provider';
import ReturningHome from './ReturningHome';

const mockLogout = jest.fn();
const mockEnter = jest.fn();

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
  expect(screen.getAllByText('工作与健康')).toHaveLength(2);
  expect(screen.getByText('com_life_condition_strained')).toBeInTheDocument();
  expect(screen.getByText('com_life_trend_improving')).toBeInTheDocument();
});

test('老用户可以再次从同一领域进入', () => {
  render(
    <MemoryRouter>
      <ReturningHome bootstrap={bootstrap} />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: /com_life_enter_house/ }));

  expect(mockEnter).toHaveBeenCalledWith(
    { archiveName: '修文测试1', entryHouse: 'h6' },
    expect.any(Object),
  );
});
