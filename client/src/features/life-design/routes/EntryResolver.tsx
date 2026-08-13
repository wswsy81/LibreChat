import { Navigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import { useLifeBootstrapQuery } from '~/data-provider';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { LifeLoading } from '../components/PageState';

export default function EntryResolver() {
  const { isAuthenticated, isAuthReady } = useAuthContext();
  const shell = useUnifiedShell();
  const bootstrap = useLifeBootstrapQuery({
    enabled: isAuthReady && isAuthenticated && shell.enabled,
    staleTime: 0,
  });

  if (
    !isAuthReady ||
    shell.isLoading ||
    (isAuthenticated && shell.enabled && bootstrap.isLoading)
  ) {
    return <LifeLoading fullScreen />;
  }
  if (!shell.enabled) {
    return <Navigate to={isAuthenticated ? '/c/new' : '/login'} replace />;
  }
  if (isAuthenticated && bootstrap.data?.lastConversationId) {
    return <Navigate to={`/c/${encodeURIComponent(bootstrap.data.lastConversationId)}`} replace />;
  }
  return <Navigate to="/home" replace />;
}
