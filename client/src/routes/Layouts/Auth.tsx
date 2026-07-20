import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import ApiErrorWatcher from '~/components/Auth/ApiErrorWatcher';
import { AuthContextProvider } from '~/hooks/AuthContext';
import WithRum from '~/lib/rum/WithRum';
import store from '~/store';

export const AuthLayout = () => (
  <AuthContextProvider>
    <WithRum>
      <Outlet />
    </WithRum>
    <ApiErrorWatcher />
  </AuthContextProvider>
);

export const OptionalAuthLayout = () => {
  const setQueriesEnabled = useSetRecoilState<boolean>(store.queriesEnabled);

  useEffect(() => {
    // Logout deliberately closes private queries before clearing account state. Public routes use a
    // fresh anonymous startup-config key, so they must reopen the query gate or ShellGate spins forever.
    setQueriesEnabled(true);
  }, [setQueriesEnabled]);

  return (
    <AuthContextProvider allowAnonymous>
      <WithRum>
        <Outlet />
      </WithRum>
      <ApiErrorWatcher />
    </AuthContextProvider>
  );
};
