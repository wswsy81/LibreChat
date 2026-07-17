/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LifeBootstrapResponse } from 'librechat-data-provider';
import ReturningHome from './ReturningHome';

const mockLogout = jest.fn();

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
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ logout: mockLogout }),
  useLocalize: () => (key: string) => key,
}));

const bootstrap: LifeBootstrapResponse = {
  authenticated: true,
  user: { id: 'user-1', name: '修文测试1' },
  profileState: 'ready',
  hasSubstantiveProfile: true,
  summary: { alias: '修文测试1', lastSurface: '当前真问题' },
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
});
