import { Navigate } from 'react-router-dom';
import { useAuthContext } from '~/hooks';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { LifeLoading } from '../components/PageState';

export default function EntryResolver() {
  const { isAuthenticated, isAuthReady } = useAuthContext();
  const shell = useUnifiedShell();

  if (!isAuthReady || shell.isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (!shell.enabled) {
    return <Navigate to={isAuthenticated ? '/c/new' : '/login'} replace />;
  }
  return <Navigate to="/home" replace />;
}
