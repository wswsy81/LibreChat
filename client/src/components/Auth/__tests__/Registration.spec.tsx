import reactRouter from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { render, waitFor, screen } from 'test/layout-test-utils';
import * as mockDataProvider from 'librechat-data-provider/react-query';
import type { TStartupConfig } from 'librechat-data-provider';
import * as miscDataProvider from '~/data-provider/Misc/queries';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import * as authMutations from '~/data-provider/Auth/mutations';
import * as authQueries from '~/data-provider/Auth/queries';
import Registration from '~/components/Auth/Registration';
import AuthLayout from '~/components/Auth/AuthLayout';

jest.mock('librechat-data-provider/react-query');

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/register');
});

const mockStartupConfig = {
  isFetching: false,
  isLoading: false,
  isError: false,
  data: {
    socialLogins: ['google', 'facebook', 'openid', 'github', 'discord', 'saml'],
    discordLoginEnabled: true,
    facebookLoginEnabled: true,
    githubLoginEnabled: true,
    googleLoginEnabled: true,
    openidLoginEnabled: true,
    openidLabel: 'Test OpenID',
    openidImageUrl: 'http://test-server.com',
    samlLoginEnabled: true,
    samlLabel: 'Test SAML',
    samlImageUrl: 'http://test-server.com',
    registrationEnabled: true,
    socialLoginEnabled: true,
    emailEnabled: false,
    serverDomain: 'mock-server',
  },
};

const setup = ({
  useGetUserQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {},
  },
  useRegisterUserMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {},
    isSuccess: false,
    error: null as Error | null,
  },
  useRefreshTokenMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {
      token: 'mock-token',
      user: {},
    },
  },
  useLoginUserMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {},
    isSuccess: false,
    error: null as Error | null,
  },
  useGetBannerQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {},
  },
  useGetStartupConfigReturnValue = mockStartupConfig,
} = {}) => {
  let registerMutationOptions: Parameters<typeof mockDataProvider.useRegisterUserMutation>[0];
  const mockUseRegisterUserMutation = jest
    .spyOn(mockDataProvider, 'useRegisterUserMutation')
    .mockImplementation((options) => {
      registerMutationOptions = options;
      return useRegisterUserMutationReturnValue as unknown as ReturnType<
        typeof mockDataProvider.useRegisterUserMutation
      >;
    });
  const mockUseGetUserQuery = jest
    .spyOn(authQueries, 'useGetUserQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetUserQueryReturnValue);
  const mockUseGetStartupConfig = jest
    .spyOn(endpointQueries, 'useGetStartupConfig')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetStartupConfigReturnValue);
  const mockUseRefreshTokenMutation = jest
    .spyOn(authMutations, 'useRefreshTokenMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useRefreshTokenMutationReturnValue);
  const mockUseLoginUserMutation = jest
    .spyOn(authMutations, 'useLoginUserMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useLoginUserMutationReturnValue);
  const mockUseOutletContext = jest.spyOn(reactRouter, 'useOutletContext').mockReturnValue({
    startupConfig: useGetStartupConfigReturnValue.data,
    startupConfigError: null,
    isFetching: false,
    setHeaderText: jest.fn(),
  });
  const _mockUseGetBannerQuery = jest
    .spyOn(miscDataProvider, 'useGetBannerQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetBannerQueryReturnValue);
  const renderResult = render(
    <AuthLayout
      startupConfig={useGetStartupConfigReturnValue.data as TStartupConfig}
      isFetching={useGetStartupConfigReturnValue.isFetching}
      error={null}
      startupConfigError={null}
      header={'Create your account'}
      pathname="register"
    >
      <Registration />
    </AuthLayout>,
  );

  return {
    ...renderResult,
    mockUseGetUserQuery,
    mockUseOutletContext,
    mockUseGetStartupConfig,
    mockUseRegisterUserMutation,
    mockUseRefreshTokenMutation,
    mockUseLoginUserMutation,
    getRegisterMutationOptions: () => registerMutationOptions,
  };
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    startupConfig: mockStartupConfig,
    startupConfigError: null,
    isFetching: false,
    setHeaderText: jest.fn(),
  }),
}));

test('renders registration form', () => {
  const { getByText, getByTestId, getByRole } = setup();
  expect(getByText(/Create your account/i)).toBeInTheDocument();
  expect(getByRole('textbox', { name: /Full name/i })).toBeInTheDocument();
  expect(getByRole('form', { name: /Registration form/i })).toBeVisible();
  expect(getByRole('textbox', { name: /Username/i })).toBeInTheDocument();
  expect(getByRole('textbox', { name: /Email/i })).toBeInTheDocument();
  expect(getByRole('group', { name: /Basic details/i })).toBeInTheDocument();
  expect(getByRole('textbox', { name: /Gender/i })).toBeInTheDocument();
  expect(getByRole('textbox', { name: /Age or age range/i })).toBeInTheDocument();
  expect(getByRole('textbox', { name: /Current city/i })).toBeInTheDocument();
  expect(getByTestId('password')).toBeInTheDocument();
  expect(getByTestId('confirm_password')).toBeInTheDocument();
  expect(getByRole('button', { name: /Submit registration/i })).toBeInTheDocument();
  expect(getByRole('link', { name: 'Login' })).toBeInTheDocument();
  expect(getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  expect(getByRole('link', { name: /Continue with Google/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Google/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/google',
  );
  expect(getByRole('link', { name: /Continue with Facebook/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Facebook/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/facebook',
  );
  expect(getByRole('link', { name: /Continue with Github/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Github/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/github',
  );
  expect(getByRole('link', { name: /Continue with Discord/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Discord/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/discord',
  );
  expect(getByRole('link', { name: /Test SAML/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Test SAML/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/saml',
  );
});

test('submits optional basic facts', async () => {
  const mutate = jest.fn();
  const { getByTestId, getByRole } = setup({
    useRegisterUserMutationReturnValue: {
      isLoading: false,
      isError: false,
      mutate,
      data: {},
      isSuccess: false,
      error: null,
    },
  });

  await userEvent.type(getByRole('textbox', { name: /Full name/i }), 'Basic Facts');
  await userEvent.type(getByRole('textbox', { name: /Email/i }), 'basics@example.com');
  await userEvent.type(getByRole('textbox', { name: /Gender/i }), '女');
  await userEvent.type(getByRole('textbox', { name: /Age or age range/i }), '30多岁');
  await userEvent.type(getByRole('textbox', { name: /Current city/i }), '厦门');
  await userEvent.type(getByTestId('password'), 'password123');
  await userEvent.type(getByTestId('confirm_password'), 'password123');
  await userEvent.click(getByRole('button', { name: /Submit registration/i }));

  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ gender: '女', age: '30多岁', city: '厦门' }),
    ),
  );
});

test('keeps the normal registration form and requires an invite code when public registration is closed', async () => {
  window.history.replaceState({}, '', '/register');
  const { getByRole, getByText, getByTestId } = setup({
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        registrationEnabled: false,
      },
    },
  });

  expect(getByRole('form', { name: /Registration form/i })).toBeVisible();
  expect(getByRole('textbox', { name: '邀请码' })).toBeVisible();
  expect(getByText(/目前是小范围邀请体验/)).toBeInTheDocument();

  await userEvent.type(getByRole('textbox', { name: /Full name/i }), 'Invite User');
  await userEvent.type(getByRole('textbox', { name: /Email/i }), 'invite@example.com');
  await userEvent.type(getByTestId('password'), 'password');
  await userEvent.type(getByTestId('confirm_password'), 'password');
  await userEvent.click(getByRole('button', { name: /Submit registration/i }));

  expect(await screen.findByText('请输入邀请码')).toBeInTheDocument();
});

test('keeps the registration form available for an invite link', () => {
  window.history.replaceState({}, '', '/register?token=invite-token');
  const { getByRole } = setup({
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        registrationEnabled: false,
      },
    },
  });

  expect(getByRole('form', { name: /Registration form/i })).toBeVisible();
  expect(getByRole('textbox', { name: '邀请码' })).toBeVisible();
});

test('prefills the invite code saved by the home invitation link', () => {
  sessionStorage.setItem('life_invite_code', 'YW-7K9P-2M8Q');
  const { getByRole } = setup({
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        registrationEnabled: false,
      },
    },
  });

  expect(getByRole('textbox', { name: '邀请码' })).toHaveValue('YW-7K9P-2M8Q');
});

test('preserves a valid entryHouse from the registration URL', async () => {
  window.history.replaceState({}, '', '/register?entryHouse=h6');

  setup();

  await waitFor(() => {
    expect(sessionStorage.getItem('life_entry_house')).toBe('h6');
  });
});

test('rejects an invalid entryHouse instead of storing it', () => {
  window.history.replaceState({}, '', '/register?entryHouse=h99');

  setup();

  expect(sessionStorage.getItem('life_entry_house')).toBeNull();
});

test('logs in immediately after registration when email verification is disabled', () => {
  sessionStorage.setItem('life_invite_code', 'YW-7K9P-2M8Q');
  sessionStorage.setItem('life_entry_house', 'h10');
  const login = jest.fn();
  const { getRegisterMutationOptions } = setup({
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        emailEnabled: false,
      },
    },
    useLoginUserMutationReturnValue: {
      isLoading: false,
      isError: false,
      mutate: login,
      data: {},
      isSuccess: false,
      error: null,
    },
  });

  const registration = {
    name: 'Codex Regression',
    username: 'codexreg',
    email: 'codex-regression@example.test',
    password: 'Test1234!',
    confirm_password: 'Test1234!',
  };

  act(() => {
    getRegisterMutationOptions()?.onSuccess?.(
      { message: 'Registration successful.' },
      registration,
      undefined,
    );
  });

  expect(login).toHaveBeenCalledWith({
    email: registration.email,
    password: registration.password,
  });
  expect(sessionStorage.getItem('life_invite_code')).toBeNull();
  expect(sessionStorage.getItem('life_entry_house')).toBe('h10');
});

// test('calls registerUser.mutate on registration', async () => {
//   const mutate = jest.fn();
//   const { getByTestId, getByRole, history } = setup({
//     // @ts-ignore - we don't need all parameters of the QueryObserverResult
//     useLoginUserReturnValue: {
//       isLoading: false,
//       mutate: mutate,
//       isError: false,
//       isSuccess: true,
//     },
//   });

//   await userEvent.type(getByRole('textbox', { name: /Full name/i }), 'John Doe');
//   await userEvent.type(getByRole('textbox', { name: /Username/i }), 'johndoe');
//   await userEvent.type(getByRole('textbox', { name: /Email/i }), 'test@test.com');
//   await userEvent.type(getByTestId('password'), 'password');
//   await userEvent.type(getByTestId('confirm_password'), 'password');
//   await userEvent.click(getByRole('button', { name: /Submit registration/i }));

//   console.log(history);
//   waitFor(() => {
//     // expect(mutate).toHaveBeenCalled();
//     expect(history.location.pathname).toBe('/c/new');
//   });
// });

test('shows validation error messages', async () => {
  const { getByTestId, getAllByRole, getByRole } = setup();
  await userEvent.type(getByRole('textbox', { name: /Full name/i }), 'J');
  await userEvent.type(getByRole('textbox', { name: /Username/i }), 'j');
  await userEvent.type(getByRole('textbox', { name: /Email/i }), 'test');
  await userEvent.type(getByTestId('password'), 'pass');
  await userEvent.type(getByTestId('confirm_password'), 'password1');
  const alerts = getAllByRole('alert');
  expect(alerts).toHaveLength(5);
  expect(alerts[0]).toHaveTextContent(/2/);
  expect(alerts[1]).toHaveTextContent(/Username must be at least 2 characters/i);
  expect(alerts[2]).toHaveTextContent(/You must enter a valid email address/i);
  expect(alerts[3]).toHaveTextContent(/Password must be at least 8 characters/i);
  expect(alerts[4]).toHaveTextContent(/Passwords do not match/i);
});

test('shows error message when registration fails', async () => {
  const mutate = jest.fn();
  const { getByTestId, getByRole } = setup({
    useRegisterUserMutationReturnValue: {
      isLoading: false,
      isError: true,
      mutate,
      error: new Error('Registration failed'),
      data: {},
      isSuccess: false,
    },
  });

  await userEvent.type(getByRole('textbox', { name: /Full name/i }), 'John Doe');
  await userEvent.type(getByRole('textbox', { name: /Username/i }), 'johndoe');
  await userEvent.type(getByRole('textbox', { name: /Email/i }), 'test@test.com');
  await userEvent.type(getByTestId('password'), 'password');
  await userEvent.type(getByTestId('confirm_password'), 'password');
  await userEvent.click(getByRole('button', { name: /Submit registration/i }));

  waitFor(() => {
    expect(screen.getByTestId('registration-error')).toBeInTheDocument();
    expect(screen.getByTestId('registration-error')).toHaveTextContent(
      /There was an error attempting to register your account. Please try again. Registration failed/i,
    );
  });
});
