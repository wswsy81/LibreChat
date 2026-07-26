/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import HomeRoute from '../HomeRoute';

const mockStartupConfig = { data: { registrationEnabled: false } };
const mockTrack = jest.fn();

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

jest.mock('~/utils/track', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

jest.mock('~/routes/Root', () => ({
  ProductShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../components/FirstArchiveSetup', () => () => <div data-testid="setup" />);
jest.mock('../../components/ReturningHome', () => () => <div data-testid="returning" />);
jest.mock('../../components/PageState', () => ({
  LifeError: () => <div data-testid="error" />,
  LifeLoading: () => <div data-testid="loading" />,
}));

function renderHome(initialEntry = '/home') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HomeRoute />
    </MemoryRouter>,
  );
}

describe('public registration policy', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockTrack.mockClear();
  });

  it('keeps one registration action when public registration requires an invite', () => {
    mockStartupConfig.data = { registrationEnabled: false };
    renderHome();

    expect(screen.getByText('com_life_invite_only_notice')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /com_life_start_first/ })).toHaveAttribute(
      'href',
      '/register?entryHouse=h6',
    );
  });

  it('keeps the public registration action when registration is enabled', () => {
    mockStartupConfig.data = { registrationEnabled: true };
    renderHome();

    expect(screen.getByRole('link', { name: /com_life_start_first/ })).toHaveAttribute(
      'href',
      '/register?entryHouse=h6',
    );
  });

  it('keeps the selected house on the registration action', async () => {
    renderHome();

    const selfPresentation = screen.getAllByRole('button', { name: /自我呈现/ });
    expect(
      selfPresentation.every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);

    await userEvent.click(selfPresentation[0]);

    expect(screen.getByRole('link', { name: /com_life_start_first/ })).toHaveAttribute(
      'href',
      '/register?entryHouse=h1',
    );
    expect(selfPresentation.every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(
      true,
    );
  });

  it('explains the product and shows the mist map', () => {
    renderHome();

    expect(screen.getByText('com_life_public_title')).toBeInTheDocument();
    expect(screen.getByText('com_life_public_description')).toBeInTheDocument();
    expect(screen.getByText('com_life_line_inertia')).toBeInTheDocument();
    expect(screen.getByText('com_life_line_intervention')).toBeInTheDocument();
    expect(screen.getByText('com_life_line_rupture')).toBeInTheDocument();
    expect(screen.getByText('com_life_line_sample_note')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'com_life_public_map_aria' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '你在这里' })).toBeInTheDocument();
    expect(screen.getByText('com_life_public_private')).toBeInTheDocument();
  });

  it('stores an invite from the home fragment without sending the code to analytics', async () => {
    renderHome('/home#invite=YW-7K9P-2M8Q');

    await waitFor(() => {
      expect(sessionStorage.getItem('life_invite_code')).toBe('YW-7K9P-2M8Q');
    });
    expect(mockTrack).toHaveBeenCalledWith('invite_opened');
    expect(mockTrack).not.toHaveBeenCalledWith(
      'invite_opened',
      expect.objectContaining({ inviteCode: expect.anything() }),
    );
  });

  it('records the invited registration start without including the invite code', async () => {
    sessionStorage.setItem('life_invite_code', 'YW-7K9P-2M8Q');
    renderHome();

    await userEvent.click(screen.getByRole('link', { name: /com_life_start_first/ }));

    expect(mockTrack).toHaveBeenCalledWith('invite_registration_started');
  });
});
