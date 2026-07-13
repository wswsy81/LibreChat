/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EntryResolver from '../EntryResolver';

const mockAuthState = { isAuthenticated: false, isAuthReady: false };
const mockBootstrapQuery = jest.fn();
const mockStartupConfig = { data: { lifeUnifiedShell: true }, isLoading: false };

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockAuthState,
}));

jest.mock('~/data-provider', () => ({
  useLifeBootstrapQuery: (config: unknown) => mockBootstrapQuery(config),
  useGetStartupConfig: () => mockStartupConfig,
}));

jest.mock('../../components/PageState', () => ({
  LifeLoading: () => <div>loading</div>,
}));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<EntryResolver />} />
        <Route path="/home" element={<div>home</div>} />
        <Route path="/resume" element={<div>resume</div>} />
        <Route path="/login" element={<div>login</div>} />
        <Route path="/c/new" element={<div>chat</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EntryResolver authentication gate', () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isAuthReady = false;
    mockStartupConfig.data = { lifeUnifiedShell: true };
    mockStartupConfig.isLoading = false;
    mockBootstrapQuery.mockReset();
    mockBootstrapQuery.mockReturnValue({ isLoading: false });
  });

  it('does not request a profile before authentication is ready', () => {
    renderRoute();

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(mockBootstrapQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('sends anonymous visitors home without populating the profile cache', () => {
    mockAuthState.isAuthReady = true;
    renderRoute();

    expect(screen.getByText('home')).toBeInTheDocument();
    expect(mockBootstrapQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('loads the profile only for an authenticated visitor', () => {
    mockAuthState.isAuthReady = true;
    mockAuthState.isAuthenticated = true;
    mockBootstrapQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { hasSubstantiveProfile: true },
    });
    renderRoute();

    expect(screen.getByText('resume')).toBeInTheDocument();
    expect(mockBootstrapQuery).toHaveBeenCalledWith({ enabled: true });
  });

  it('drops authenticated users into safe chat mode when the shell flag is off', () => {
    mockAuthState.isAuthReady = true;
    mockAuthState.isAuthenticated = true;
    mockStartupConfig.data = { lifeUnifiedShell: false };
    renderRoute();

    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(mockBootstrapQuery).toHaveBeenCalledWith({ enabled: false });
  });

  it('sends anonymous visitors to login when the shell flag is off', () => {
    mockAuthState.isAuthReady = true;
    mockStartupConfig.data = { lifeUnifiedShell: false };
    renderRoute();

    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
