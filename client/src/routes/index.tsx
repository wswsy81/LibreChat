import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import LegacyRouteGate from '~/features/life-design/components/LegacyRouteGate';
import dashboardRoutes from './Dashboard';

type DefaultComponentModule = { default: ComponentType };

const loadDefaultComponent = (loader: () => Promise<DefaultComponentModule>) =>
  loader().then(({ default: Component }) => ({ Component }));

const loadShellComponent = (loader: () => Promise<DefaultComponentModule>) =>
  Promise.all([loader(), import('~/features/life-design/components/ShellGate')]).then(
    ([{ default: RouteComponent }, { default: ShellGate }]) => ({
      Component: () => (
        <ShellGate>
          <RouteComponent />
        </ShellGate>
      ),
    }),
  );

const loadAgentMarketplace = () =>
  Promise.all([
    import('~/components/Agents/Marketplace'),
    import('~/components/Agents/MarketplaceContext'),
  ]).then(([{ default: AgentMarketplace }, { MarketplaceProvider }]) => ({
    Component: () => (
      <MarketplaceProvider>
        <AgentMarketplace />
      </MarketplaceProvider>
    ),
  }));

const LazyEntryResolver = lazy(() => import('~/features/life-design/routes/EntryResolver'));
const LazyRouteErrorBoundary = lazy(() => import('./RouteErrorBoundary'));
const LazyAuthLayout = lazy(() =>
  import('./Layouts/Auth').then(({ AuthLayout }) => ({ default: AuthLayout })),
);
const LazyOptionalAuthLayout = lazy(() =>
  import('./Layouts/Auth').then(({ OptionalAuthLayout }) => ({ default: OptionalAuthLayout })),
);

const RouteFallback = () => <div className="min-h-screen bg-life-paper" aria-busy="true" />;

const EntryRoute = () => (
  <Suspense fallback={<RouteFallback />}>
    <LazyEntryResolver />
  </Suspense>
);

const RouteError = () => (
  <Suspense fallback={<RouteFallback />}>
    <LazyRouteErrorBoundary />
  </Suspense>
);

const AuthRoute = () => (
  <Suspense fallback={<RouteFallback />}>
    <LazyAuthLayout />
  </Suspense>
);

const OptionalAuthRoute = () => (
  <Suspense fallback={<RouteFallback />}>
    <LazyOptionalAuthLayout />
  </Suspense>
);

const loadInlinePromptsView = () =>
  import('~/components/Prompts/layouts/InlinePromptsView').then((m) => ({
    Component: m.default,
  }));

const loadSkillsView = () =>
  import('~/components/Skills/layouts/SkillsView').then((m) => ({
    Component: m.default,
  }));

const loadProjectsView = () =>
  import('~/components/Projects').then((m) => ({
    Component: m.ProjectsView,
  }));

const loadProjectWorkspace = () =>
  import('~/components/Projects').then((m) => ({
    Component: m.ProjectWorkspace,
  }));

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      path: 's/archive/:shareToken',
      lazy: () =>
        loadDefaultComponent(() => import('~/features/life-design/routes/SharedReportRoute')),
      errorElement: <RouteError />,
    },
    {
      path: 'share/:shareId',
      element: <LegacyRouteGate />,
      errorElement: <RouteError />,
      children: [
        {
          index: true,
          lazy: () => loadDefaultComponent(() => import('./ShareRoute')),
        },
      ],
    },
    {
      element: <OptionalAuthRoute />,
      errorElement: <RouteError />,
      children: [
        {
          path: '/',
          element: <EntryRoute />,
        },
        {
          path: 'home',
          lazy: () => loadShellComponent(() => import('~/features/life-design/routes/HomeRoute')),
        },
        {
          path: 'faq',
          lazy: () => loadShellComponent(() => import('~/features/life-design/routes/FaqRoute')),
        },
      ],
    },
    {
      path: 'oauth',
      errorElement: <RouteError />,
      children: [
        {
          path: 'success',
          lazy: () => loadDefaultComponent(() => import('~/components/OAuth/OAuthSuccess')),
        },
        {
          path: 'error',
          lazy: () => loadDefaultComponent(() => import('~/components/OAuth/OAuthError')),
        },
      ],
    },
    {
      path: '/',
      lazy: () => loadDefaultComponent(() => import('./Layouts/Startup')),
      errorElement: <RouteError />,
      children: [
        {
          path: 'register',
          lazy: () => loadDefaultComponent(() => import('~/components/Auth/Registration')),
        },
        {
          path: 'forgot-password',
          lazy: () => loadDefaultComponent(() => import('~/components/Auth/RequestPasswordReset')),
        },
        {
          path: 'reset-password',
          lazy: () => loadDefaultComponent(() => import('~/components/Auth/ResetPassword')),
        },
      ],
    },
    {
      path: 'verify',
      lazy: () => loadDefaultComponent(() => import('~/components/Auth/VerifyEmail')),
      errorElement: <RouteError />,
    },
    {
      element: <AuthRoute />,
      errorElement: <RouteError />,
      children: [
        {
          path: '/',
          lazy: () => loadDefaultComponent(() => import('./Layouts/Login')),
          children: [
            {
              path: 'login',
              lazy: () => loadDefaultComponent(() => import('~/components/Auth/Login')),
            },
            {
              path: 'login/2fa',
              lazy: () => loadDefaultComponent(() => import('~/components/Auth/TwoFactorScreen')),
            },
          ],
        },
        {
          element: <LegacyRouteGate />,
          children: [dashboardRoutes],
        },
        {
          path: '/',
          lazy: () => loadDefaultComponent(() => import('./Root')),
          children: [
            {
              path: 'resume',
              lazy: () =>
                loadShellComponent(() => import('~/features/life-design/routes/ResumeRoute')),
            },
            {
              path: 'archive',
              lazy: () =>
                loadShellComponent(() => import('~/features/life-design/routes/ArchiveRoute')),
            },
            {
              path: 'inbox',
              lazy: () =>
                loadShellComponent(() => import('~/features/life-design/routes/InboxRoute')),
            },
            {
              path: 'admin',
              lazy: () =>
                loadShellComponent(() => import('~/features/life-design/routes/AdminRoute')),
            },
            {
              path: 'about',
              lazy: () =>
                loadShellComponent(() => import('~/features/life-design/routes/AboutRoute')),
            },
            {
              path: 'archive/reports/:reportId',
              lazy: () =>
                loadShellComponent(() => import('~/features/life-design/routes/ReportRoute')),
            },
            {
              path: 'c/:conversationId?',
              lazy: () => loadDefaultComponent(() => import('./ChatRoute')),
            },
            {
              element: <LegacyRouteGate />,
              children: [
                {
                  path: 'search',
                  lazy: () => loadDefaultComponent(() => import('./Search')),
                },
                {
                  path: 'prompts',
                  element: <Navigate to="/prompts/new" replace={true} />,
                },
                {
                  path: 'prompts/new',
                  lazy: loadInlinePromptsView,
                },
                {
                  path: 'prompts/:promptId',
                  lazy: loadInlinePromptsView,
                },
                {
                  path: 'skills',
                  lazy: loadSkillsView,
                },
                {
                  path: 'skills/new',
                  lazy: loadSkillsView,
                },
                {
                  path: 'skills/:skillId',
                  lazy: loadSkillsView,
                },
                {
                  path: 'skills/:skillId/edit',
                  lazy: loadSkillsView,
                },
                {
                  path: 'projects',
                  lazy: loadProjectsView,
                },
                {
                  path: 'projects/:projectId',
                  lazy: loadProjectWorkspace,
                },
                {
                  path: 'agents',
                  lazy: loadAgentMarketplace,
                },
                {
                  path: 'agents/:category',
                  lazy: loadAgentMarketplace,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  { basename: baseHref },
);
