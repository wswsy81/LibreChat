/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EntryResolver from '../EntryResolver';

const mockAuthState = { isAuthenticated: false, isAuthReady: false };
const mockBootstrapQuery = jest.fn();

jest.mock('~/hooks', () => ({
  useAuthContext: () => mockAuthState,
}));

jest.mock('~/data-provider', () => ({
  useLifeBootstrapQuery: (config: unknown) => mockBootstrapQuery(config),
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
      </Routes>
    </MemoryRouter>,
  );
}

describe('EntryResolver authentication gate', () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isAuthReady = false;
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
});
