/**
 * @jest-environment @happy-dom/jest-environment
 */
/* eslint-disable i18next/no-literal-string */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LegacyRouteGate from './LegacyRouteGate';
import useUnifiedShell from '../hooks/useUnifiedShell';

jest.mock('../hooks/useUnifiedShell');

const mockUseUnifiedShell = useUnifiedShell as jest.MockedFunction<typeof useUnifiedShell>;

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/projects']}>
      <Routes>
        <Route element={<LegacyRouteGate />}>
          <Route path="projects" element={<div>legacy projects</div>} />
        </Route>
        <Route path="home" element={<div>life home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

test('统一产品壳开启时旧 LibreChat 路由统一回首页', () => {
  mockUseUnifiedShell.mockReturnValue({ enabled: true, isLoading: false });
  renderGate();
  expect(screen.getByText('life home')).toBeInTheDocument();
  expect(screen.queryByText('legacy projects')).not.toBeInTheDocument();
});

test('回滚开关关闭统一壳时仍可进入旧路由', () => {
  mockUseUnifiedShell.mockReturnValue({ enabled: false, isLoading: false });
  renderGate();
  expect(screen.getByText('legacy projects')).toBeInTheDocument();
});
