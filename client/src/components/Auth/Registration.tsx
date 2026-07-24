import React, { useContext, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, SecretInput, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import { loginPage } from 'librechat-data-provider';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLoginUserMutation } from '~/data-provider/Auth/mutations';
import {
  getEntryHouseFromSearch,
  getStoredEntryHouse,
  homePathForEntryHouse,
  storeEntryHouse,
} from '~/features/life-design/entry';
import { useLocalize, TranslationKeys } from '~/hooks';
import { clearStoredInviteCode, formatLifeInviteCode, getStoredInviteCode } from '~/utils/invite';
import { track } from '~/utils/track';
import { ErrorMessage } from './ErrorMessage';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching, setHeaderText } =
    useOutletContext<TLoginLayoutContext>();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const requestedEntryHouse = getEntryHouseFromSearch(location.search);
  const entryHouse = requestedEntryHouse ?? getStoredEntryHouse();
  const homePath = homePathForEntryHouse(entryHouse);

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({
    mode: 'onChange',
    defaultValues: { inviteCode: getStoredInviteCode() },
  });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const inviteRequired = startupConfig?.registrationEnabled === false && !token;
  const validTheme = isDark(theme) ? 'dark' : 'light';

  useEffect(() => {
    setHeaderText(inviteRequired ? 'com_auth_invite_only_title' : 'com_auth_create_account');
  }, [inviteRequired, setHeaderText]);

  useEffect(() => {
    if (requestedEntryHouse) {
      storeEntryHouse(requestedEntryHouse);
    }
  }, [requestedEntryHouse]);

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);
  const authInputClassName =
    'webkit-dark-styles transition-color peer w-full rounded-[4px] border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 hover:border-border-light focus:border-life-moss focus:outline-none focus-visible:border-life-moss';
  const authSecretInputClassName = `${authInputClassName} h-auto pr-12`;
  const authLabelClassName =
    'absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-life-moss rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4';
  const authSecretButtonClassName =
    'size-9 rounded-[4px] text-text-secondary-alt hover:bg-transparent hover:text-text-primary';

  const loginUser = useLoginUserMutation({
    onSuccess: (data) => {
      setIsSubmitting(false);
      if (data.twoFAPending && data.tempToken) {
        navigate(`/login/2fa?tempToken=${data.tempToken}`, { replace: true });
        return;
      }
      navigate(homePath, { replace: true });
    },
    onError: () => {
      setIsSubmitting(false);
      navigate(`/login?redirect_to=${encodeURIComponent(homePath)}`, { replace: true });
    },
  });

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: (_data, registration) => {
      clearStoredInviteCode();
      track('register_success');
      if (startupConfig?.emailEnabled === false) {
        loginUser.mutate({
          email: registration.email,
          password: registration.password,
        });
        return;
      }

      setIsSubmitting(false);
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            navigate(`/login?redirect_to=${encodeURIComponent(homePath)}`, { replace: true });
            return 0;
          } else {
            return prevCountdown - 1;
          }
        });
      }, 1000);
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if ((error as TError).response?.data?.message) {
        setErrorMessage((error as TError).response?.data?.message ?? '');
      }
    },
  });

  const renderInput = (
    id: Extract<keyof TRegisterUser, string>,
    label: TranslationKeys,
    type: string,
    validation: object,
  ) => {
    const fieldLabel = localize(label);
    const field = register(id, validation);
    let autoComplete = String(id);
    if (id === 'inviteCode') autoComplete = 'off';
    else if (type === 'password') autoComplete = 'new-password';

    return (
      <div className="mb-4">
        <div className="relative">
          {type === 'password' ? (
            <SecretInput
              id={id}
              autoComplete={autoComplete}
              aria-label={fieldLabel}
              {...field}
              aria-invalid={!!errors[id]}
              className={authSecretInputClassName}
              placeholder=" "
              data-testid={id}
              label={fieldLabel}
              labelClassName={authLabelClassName}
              controlsClassName="right-2"
              buttonClassName={authSecretButtonClassName}
            />
          ) : (
            <>
              <input
                id={id}
                type={type}
                autoComplete={autoComplete}
                aria-label={fieldLabel}
                {...field}
                aria-invalid={!!errors[id]}
                className={authInputClassName}
                placeholder=" "
                data-testid={id}
              />
              <label htmlFor={id} className={authLabelClassName}>
                {fieldLabel}
              </label>
            </>
          )}
        </div>
        {errors[id] && (
          <span role="alert" className="mt-1 text-sm text-red-500">
            {String(errors[id]?.message) ?? ''}
          </span>
        )}
      </div>
    );
  };

  const optionalBasicsValidation = {
    maxLength: {
      value: 60,
      message: localize('com_auth_basic_profile_max_length'),
    },
  };

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-life-moss bg-life-moss/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
          role="alert"
        >
          {localize(
            startupConfig?.emailEnabled
              ? 'com_auth_registration_success_generic'
              : 'com_auth_registration_success_insecure',
          ) +
            ' ' +
            localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </div>
      )}
      {!startupConfigError && !isFetching && (
        <>
          {inviteRequired && (
            <p
              className="mt-6 border-l-2 border-life-brass py-1 pl-4 text-left font-life-kai text-life-body leading-8 text-life-brass"
              role="status"
            >
              {localize('com_auth_invite_only_description')}
            </p>
          )}
          <form
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) => {
              const inviteCode = data.inviteCode?.trim() || undefined;
              const gender = data.gender?.trim() || undefined;
              const age = data.age?.trim() || undefined;
              const city = data.city?.trim() || undefined;
              track('register_submit', { invited: Boolean(inviteCode || token) });
              registerUser.mutate({
                ...data,
                gender,
                age,
                city,
                inviteCode,
                token: token ?? undefined,
              });
            })}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: {
                value: 2,
                message: localize('com_auth_name_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_name_max_length'),
              },
            })}
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: {
                value: 2,
                message: localize('com_auth_username_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_username_max_length'),
              },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 1,
                message: localize('com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize('com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            {renderInput('inviteCode', 'com_auth_invite_code', 'text', {
              required: inviteRequired ? localize('com_auth_invite_code_required') : false,
              validate: (value?: string) =>
                !value ||
                Boolean(formatLifeInviteCode(value)) ||
                localize('com_auth_invite_code_invalid'),
            })}
            <fieldset className="mb-4 rounded-[4px] border border-border-light px-3.5 pb-1 pt-3">
              <legend className="px-1 font-life-sans text-sm text-text-primary">
                {localize('com_auth_basic_profile_title')}
              </legend>
              <p className="mb-4 text-left text-xs leading-5 text-text-secondary-alt">
                {localize('com_auth_basic_profile_description')}
              </p>
              {renderInput('gender', 'com_auth_gender_optional', 'text', optionalBasicsValidation)}
              {renderInput('age', 'com_auth_age_optional', 'text', optionalBasicsValidation)}
              {renderInput('city', 'com_auth_city_optional', 'text', optionalBasicsValidation)}
            </fieldset>
            {renderInput('password', 'com_auth_password', 'password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: {
                value: 128,
                message: localize('com_auth_password_max_length'),
              },
            })}
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value: string) =>
                value === password || localize('com_auth_password_not_match'),
            })}

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{
                    ...startupConfig.turnstile.options,
                    theme: validTheme,
                  }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-6">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  (requireCaptcha && !turnstileToken)
                }
                type="submit"
                aria-label="Submit registration"
                variant="submit"
                className="h-12 w-full rounded-[4px] bg-life-moss font-life-sans text-life-paper hover:bg-life-moss-deep"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>

          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
            {localize('com_auth_already_have_account')}{' '}
            <a
              href={loginPage()}
              aria-label="Login"
              className="inline-flex p-1 text-sm font-medium text-life-cinnabar transition-colors hover:text-life-cinnabar-deep dark:text-[#D98A76] dark:hover:text-[#E8A794]"
            >
              {localize('com_auth_login')}
            </a>
          </p>
        </>
      )}
    </>
  );
};

export default Registration;
