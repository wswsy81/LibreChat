import { Outlet } from 'react-router-dom';
import ApiErrorWatcher from '~/components/Auth/ApiErrorWatcher';
import { AuthContextProvider } from '~/hooks/AuthContext';
import WithRum from '~/lib/rum/WithRum';

export const AuthLayout = () => (
  <AuthContextProvider>
    <WithRum>
      <Outlet />
    </WithRum>
    <ApiErrorWatcher />
  </AuthContextProvider>
);

export const OptionalAuthLayout = () => (
  <AuthContextProvider allowAnonymous>
    <WithRum>
      <Outlet />
    </WithRum>
    <ApiErrorWatcher />
  </AuthContextProvider>
);
