/**
 * @jest-environment @happy-dom/jest-environment
 */
/* eslint-disable i18next/no-literal-string */
import { ThemeContext } from '@librechat/client';
import { render, screen, waitFor } from '@testing-library/react';
import AuthLayout from '../AuthLayout';

const setTheme = jest.fn();

jest.mock('../SocialLoginRender', () => () => null);
jest.mock('../BlinkAnimation', () => ({
  BlinkAnimation: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../Banners', () => ({ Banner: () => null }));
jest.mock('../Footer', () => () => null);
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

test('认证页强制浅色且不提供主题切换入口', async () => {
  render(
    <ThemeContext.Provider
      value={{
        theme: 'dark',
        setTheme,
        setThemeRGB: jest.fn(),
        setThemeName: jest.fn(),
        resetTheme: jest.fn(),
      }}
    >
      <AuthLayout
        startupConfig={null}
        isFetching={false}
        error={null}
        startupConfigError={null}
        header="登录"
        pathname="login"
      >
        <div>login body</div>
      </AuthLayout>
    </ThemeContext.Provider>,
  );

  await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'));
  expect(screen.queryByLabelText(/toggle theme|切换主题/i)).not.toBeInTheDocument();
  expect(screen.getByText('login body')).toBeInTheDocument();
});
