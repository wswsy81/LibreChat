import { Navigate } from 'react-router-dom';
import { useLifeBootstrapQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import { LifeLoading } from '../components/PageState';

export default function EntryResolver() {
  const { isAuthenticated, isAuthReady } = useAuthContext();
  const bootstrap = useLifeBootstrapQuery({ enabled: isAuthReady });

  if (!isAuthReady || bootstrap.isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/home" replace />;
  }
  if (bootstrap.isError || bootstrap.data?.profileState === 'unavailable') {
    return <Navigate to="/home?archive=unavailable" replace />;
  }
  return <Navigate to={bootstrap.data?.hasSubstantiveProfile ? '/resume' : '/home'} replace />;
}
