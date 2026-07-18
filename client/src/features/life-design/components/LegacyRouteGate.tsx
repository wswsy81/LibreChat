import { Navigate, Outlet } from 'react-router-dom';
import type { ReactElement } from 'react';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { LifeLoading } from './PageState';

/** Keeps LibreChat's generic product surfaces available only for the rollback mode. */
export default function LegacyRouteGate({ children }: { children?: ReactElement }) {
  const { enabled, isLoading } = useUnifiedShell();
  if (isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (enabled) {
    return <Navigate to="/home" replace />;
  }
  return children ?? <Outlet />;
}
