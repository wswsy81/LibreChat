/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import HomeRoute from '../HomeRoute';

const mockStartupConfig = { data: { registrationEnabled: false } };

jest.mock('@librechat/client', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: null, isAuthenticated: false, isAuthReady: true }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockStartupConfig,
  useLifeBootstrapQuery: () => ({ isLoading: false }),
}));

jest.mock('~/routes/Root', () => ({
  ProductShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../components/FirstArchiveSetup', () => () => <div data-testid="setup" />);
jest.mock('../../components/ReturningHome', () => () => <div data-testid="returning" />);
jest.mock('../../components/PageState', () => ({
  LifeError: () => <div data-testid="error" />,
  LifeLoading: () => <div data-testid="loading" />,
}));

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <HomeRoute />
    </MemoryRouter>,
  );
}

describe('public registration policy', () => {
  it('does not send public visitors to a registration form that production rejects', () => {
    mockStartupConfig.data = { registrationEnabled: false };
    renderHome();

    expect(screen.getByText('com_life_invite_only_notice')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /com_life_start_first/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument();
  });

  it('keeps the public registration action when registration is enabled', () => {
    mockStartupConfig.data = { registrationEnabled: true };
    renderHome();

    expect(screen.getByRole('link', { name: /com_life_start_first/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
