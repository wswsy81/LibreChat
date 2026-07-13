import { Navigate } from 'react-router-dom';
import { useLifeBootstrapQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { LifeLoading } from '../components/PageState';

export default function EntryResolver() {
  const { isAuthenticated, isAuthReady } = useAuthContext();
  const shell = useUnifiedShell();
  const bootstrap = useLifeBootstrapQuery({
    enabled: isAuthReady && isAuthenticated && shell.enabled,
  });

  if (!isAuthReady || shell.isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (!shell.enabled) {
    return <Navigate to={isAuthenticated ? '/c/new' : '/login'} replace />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/home" replace />;
  }
  if (bootstrap.isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (bootstrap.isError || bootstrap.data?.profileState === 'unavailable') {
    return <Navigate to="/home?archive=unavailable" replace />;
  }
  return <Navigate to={bootstrap.data?.hasSubstantiveProfile ? '/resume' : '/home'} replace />;
}
