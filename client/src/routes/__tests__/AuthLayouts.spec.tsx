/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecoilRoot, useRecoilValue } from 'recoil';
import store from '~/store';
import { OptionalAuthLayout } from '../Layouts/Auth';

jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('~/lib/rum/WithRum', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('~/components/Auth/ApiErrorWatcher', () => () => null);

function QueryGateProbe() {
  const enabled = useRecoilValue(store.queriesEnabled);
  return <div data-testid="query-gate">{String(enabled)}</div>;
}

describe('OptionalAuthLayout', () => {
  it('reopens public queries after logout closed the global query gate', async () => {
    render(
      <RecoilRoot initializeState={({ set }) => set(store.queriesEnabled, false)}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route element={<OptionalAuthLayout />}>
              <Route path="home" element={<QueryGateProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </RecoilRoot>,
    );

    await waitFor(() => expect(screen.getByTestId('query-gate')).toHaveTextContent('true'));
  });
});
