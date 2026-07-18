import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import {
  Login,
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import AgentMarketplace from '~/components/Agents/Marketplace';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import { AuthContextProvider } from '~/hooks/AuthContext';
import {
  AboutRoute,
  AdminRoute,
  ArchiveRoute,
  EntryResolver,
  HomeRoute,
  InboxRoute,
  LegacyRouteGate,
  ReportRoute,
  ResumeRoute,
  SharedReportRoute,
  ShellGate,
} from '~/features/life-design';
import WithRum from '~/lib/rum/WithRum';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import dashboardRoutes from './Dashboard';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Search from './Search';
import Root from './Root';

const AuthLayout = () => (
  <AuthContextProvider>
    <WithRum>
      <Outlet />
    </WithRum>
    <ApiErrorWatcher />
  </AuthContextProvider>
);

const OptionalAuthLayout = () => (
  <AuthContextProvider allowAnonymous>
    <WithRum>
      <Outlet />
    </WithRum>
    <ApiErrorWatcher />
  </AuthContextProvider>
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
      element: <SharedReportRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'share/:shareId',
      element: (
        <LegacyRouteGate>
          <ShareRoute />
        </LegacyRouteGate>
      ),
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <OptionalAuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <EntryResolver />,
        },
        {
          path: 'home',
          element: (
            <ShellGate>
              <HomeRoute />
            </ShellGate>
          ),
        },
      ],
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: '/',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'register',
          element: <Registration />,
        },
        {
          path: 'forgot-password',
          element: <RequestPasswordReset />,
        },
        {
          path: 'reset-password',
          element: <ResetPassword />,
        },
      ],
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <LoginLayout />,
          children: [
            {
              path: 'login',
              element: <Login />,
            },
            {
              path: 'login/2fa',
              element: <TwoFactorScreen />,
            },
          ],
        },
        {
          element: <LegacyRouteGate />,
          children: [dashboardRoutes],
        },
        {
          path: '/',
          element: <Root />,
          children: [
            {
              path: 'resume',
              element: (
                <ShellGate>
                  <ResumeRoute />
                </ShellGate>
              ),
            },
            {
              path: 'archive',
              element: (
                <ShellGate>
                  <ArchiveRoute />
                </ShellGate>
              ),
            },
            {
              path: 'inbox',
              element: (
                <ShellGate>
                  <InboxRoute />
                </ShellGate>
              ),
            },
            {
              path: 'admin',
              element: (
                <ShellGate>
                  <AdminRoute />
                </ShellGate>
              ),
            },
            {
              path: 'about',
              element: (
                <ShellGate>
                  <AboutRoute />
                </ShellGate>
              ),
            },
            {
              path: 'archive/reports/:reportId',
              element: (
                <ShellGate>
                  <ReportRoute />
                </ShellGate>
              ),
            },
            {
              path: 'c/:conversationId?',
              element: <ChatRoute />,
            },
            {
              element: <LegacyRouteGate />,
              children: [
                {
                  path: 'search',
                  element: <Search />,
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
                  element: (
                    <MarketplaceProvider>
                      <AgentMarketplace />
                    </MarketplaceProvider>
                  ),
                },
                {
                  path: 'agents/:category',
                  element: (
                    <MarketplaceProvider>
                      <AgentMarketplace />
                    </MarketplaceProvider>
                  ),
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
