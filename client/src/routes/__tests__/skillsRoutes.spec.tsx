import React from 'react';

jest.mock('~/components/Auth', () => ({
  Login: () => null,
  VerifyEmail: () => null,
  Registration: () => null,
  ResetPassword: () => null,
  ApiErrorWatcher: () => null,
  TwoFactorScreen: () => null,
  RequestPasswordReset: () => null,
}));

jest.mock('~/components/Agents/MarketplaceContext', () => ({
  MarketplaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('~/components/Agents/Marketplace', () => () => null);
jest.mock('~/components/OAuth', () => ({
  OAuthSuccess: () => null,
  OAuthError: () => null,
}));
jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../RouteErrorBoundary', () => () => null);
jest.mock('../Layouts/Startup', () => () => null);
jest.mock('../Layouts/Login', () => () => null);
jest.mock('../Dashboard', () => ({
  __esModule: true,
  default: { path: 'dashboard', element: null },
}));
jest.mock('../ShareRoute', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../ChatRoute', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../Search', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../Root', () => ({
  __esModule: true,
  default: () => null,
}));

import { router } from '../index';
import { LegacyRouteGate } from '~/features/life-design';

type RouteNode = {
  path?: string;
  element?: React.ReactElement;
  children?: RouteNode[];
};

function flattenPaths(routes: RouteNode[]): string[] {
  return routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...(route.children ? flattenPaths(route.children) : []),
  ]);
}

function isPathGuarded(routes: RouteNode[], target: string, guarded = false): boolean {
  for (const route of routes) {
    const nextGuarded = guarded || route.element?.type === LegacyRouteGate;
    if (route.path === target) return nextGuarded;
    if (route.children && isPathGuarded(route.children, target, nextGuarded)) return true;
  }
  return false;
}

describe('skills routes', () => {
  it('registers the explicit /skills/new route', () => {
    const paths = flattenPaths((router as unknown as { routes: RouteNode[] }).routes);

    expect(paths).toContain('skills/new');
  });

  it.each([
    'search',
    'prompts/new',
    'skills/new',
    'projects',
    'projects/:projectId',
    'agents',
    'dashboard',
  ])('keeps legacy route %s behind LegacyRouteGate', (path) => {
    const routes = (router as unknown as { routes: RouteNode[] }).routes;
    expect(isPathGuarded(routes, path)).toBe(true);
  });

  it('wraps the generic share route directly with LegacyRouteGate', () => {
    const routes = (router as unknown as { routes: RouteNode[] }).routes;
    const share = routes.find((route) => route.path === 'share/:shareId');
    expect(share?.element?.type).toBe(LegacyRouteGate);
  });
});
