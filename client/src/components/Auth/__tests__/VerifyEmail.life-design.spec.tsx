/**
 * @jest-environment @happy-dom/jest-environment
 */
import { ThemeContext } from '@librechat/client';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VerifyEmail from '../VerifyEmail';

const setTheme = jest.fn();
const mockVerifyMutation = { isLoading: false, mutate: jest.fn() };
const mockResendMutation = { isLoading: false, mutate: jest.fn() };

jest.mock('~/data-provider', () => ({
  useVerifyEmailMutation: () => mockVerifyMutation,
  useResendVerificationEmail: () => mockResendMutation,
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

test('邮箱验证页同样锁定浅色且不暴露主题切换', async () => {
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
      <MemoryRouter>
        <VerifyEmail />
      </MemoryRouter>
    </ThemeContext.Provider>,
  );

  await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'));
  expect(screen.queryByLabelText(/toggle theme|切换主题/i)).not.toBeInTheDocument();
});
