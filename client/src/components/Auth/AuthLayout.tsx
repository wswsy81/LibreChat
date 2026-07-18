import { useContext, useEffect } from 'react';
import { ThemeContext } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();
  const { setTheme } = useContext(ThemeContext);

  useEffect(() => {
    setTheme('light');
  }, [setTheme]);

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a className="font-semibold text-life-cinnabar hover:underline" href="/forgot-password">
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-life-paper">
      <Banner />
      <BlinkAnimation active={isFetching}>
        <div className="mt-10 w-full text-center" style={{ userSelect: 'none' }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <p className="font-life-mono text-[10px] tracking-[0.26em] text-life-cinnabar">
            LIFE DESIGN STUDIO
          </p>
          <p className="mt-1 font-life-serif text-2xl font-black text-life-ink">
            {localize('com_life_brand')}
          </p>
        </div>
      </BlinkAnimation>
      <DisplayError />
      <main className="flex flex-grow items-center justify-center">
        <div className="w-authPageWidth overflow-hidden px-6 py-4 sm:max-w-md">
          {!hasStartupConfigError && !isFetching && header && (
            <h1
              className="mb-4 text-center font-life-serif text-2xl font-semibold text-life-ink"
              style={{ userSelect: 'none' }}
            >
              {header}
            </h1>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
