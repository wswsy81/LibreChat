import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { LifeLoading } from './PageState';

/** Redirects life-design pages into LibreChat safe chat mode when the unified shell is off. */
export default function ShellGate({ children }: { children: ReactElement }) {
  const { enabled, isLoading } = useUnifiedShell();
  if (isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (!enabled) {
    return <Navigate to="/c/new" replace />;
  }
  return children;
}
