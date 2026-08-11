/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EntryResolver from '../EntryResolver';

const mockAuthState = { isAuthenticated: false, isAuthReady: false };
const mockStartupConfig = { data: { lifeUnifiedShell: true }, isLoading: false };

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockAuthState,
}));

jest.mock('~/data-provider', () => ({
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
  });

  it('waits until authentication is ready before resolving the product entry', () => {
    renderRoute();

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('sends anonymous visitors to the public home', () => {
    mockAuthState.isAuthReady = true;
    renderRoute();

    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('sends authenticated visitors with an existing profile to Today instead of auto-resuming', () => {
    mockAuthState.isAuthReady = true;
    mockAuthState.isAuthenticated = true;
    renderRoute();

    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.queryByText('resume')).not.toBeInTheDocument();
  });

  it('drops authenticated users into safe chat mode when the shell flag is off', () => {
    mockAuthState.isAuthReady = true;
    mockAuthState.isAuthenticated = true;
    mockStartupConfig.data = { lifeUnifiedShell: false };
    renderRoute();

    expect(screen.getByText('chat')).toBeInTheDocument();
  });

  it('sends anonymous visitors to login when the shell flag is off', () => {
    mockAuthState.isAuthReady = true;
    mockStartupConfig.data = { lifeUnifiedShell: false };
    renderRoute();

    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
