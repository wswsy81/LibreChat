/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import ArchiveRoute from '../ArchiveRoute';

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('~/data-provider', () => ({
  useLifeArchiveQuery: () => ({
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    data: {
      schemaVersion: 1,
      profileVersion: '2026-08-01T00:00:00.000Z',
      activeHouse: 'h2',
      profile: {
        alias: '修文',
        archetype: '这段人物公式不应在完整档案重复出现',
        compass: { workview: '这段工作观不应在完整档案重复出现' },
        energy: { gain: ['这段恢复方式不应在完整档案重复出现'] },
        updatedAt: '2026-08-01T00:00:00.000Z',
        signals: [],
        timeline: [],
      },
      reports: [],
    },
  }),
  useLifeBootstrapQuery: () => ({ data: { summary: { lifeWheel: { houses: [] } } } }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) =>
    key === 'com_life_archive_active_domain' ? `${key}:${values?.[0]}` : key,
}));

jest.mock('../../components/ArchiveDossier', () => () => <div>archive-dossier</div>);
jest.mock('../../components/ArchiveMistMap', () => () => <div>archive-map</div>);
jest.mock('../../components/BasicsForm', () => () => <div>basics-form</div>);
jest.mock('../MeRoute', () => ({ embedded }: { embedded?: boolean }) => (
  <section data-testid="current-self-cover" data-embedded={String(Boolean(embedded))}>
    current-self-cover
  </section>
));
jest.mock('../../components/PageState', () => ({
  LifeError: () => <div>life-error</div>,
  LifeLoading: () => <div>life-loading</div>,
}));

const renderArchive = (path = '/me') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/me" element={<ArchiveRoute />} />
      </Routes>
    </MemoryRouter>,
  );

test('档案页明确当前领域，同时说明人物层仍跨领域共用', () => {
  renderArchive();

  expect(
    screen.getByText('com_life_archive_active_domain:com_life_map_house_h2'),
  ).toBeInTheDocument();
  expect(screen.getByText('com_life_archive_active_domain_help')).toBeInTheDocument();
});

test('统一我页面先展示现在的我封面，不再保留第二个我或人生档案入口', () => {
  renderArchive();

  expect(screen.getByTestId('current-self-cover')).toHaveAttribute('data-embedded', 'true');
  expect(
    screen.queryByRole('link', { name: /com_life_archive_open_self/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /com_life_continue_archive/ }),
  ).not.toBeInTheDocument();
});

test('统一我页面保留档案正文，并按新顺序提供八个稳定章节', () => {
  renderArchive();

  expect(screen.getByText('archive-dossier')).toBeInTheDocument();
  expect(screen.getByText('archive-map')).toBeInTheDocument();
  expect(
    [
      'archive-dossier',
      'archive-people',
      'archive-map',
      'archive-moments',
      'archive-testing',
      'archive-reports',
      'me-basics',
      'archive-revisions',
    ].map((id) => document.getElementById(id)?.getAttribute('data-section-index')),
  ).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
  expect(screen.getByRole('link', { name: /com_life_archive_reports_title/ })).toHaveAttribute(
    'href',
    '#archive-reports',
  );
});

test('基本资料靠后且默认收起，用户点击后才加载表单', async () => {
  renderArchive();

  const toggle = screen.getByRole('button', { name: /com_life_archive_basics_expand/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('basics-form')).not.toBeInTheDocument();

  await userEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('basics-form')).toBeInTheDocument();
});

test('/me#me-basics 会直接展开并定位基本资料章节', () => {
  Element.prototype.scrollIntoView = jest.fn();
  renderArchive('/me#me-basics');

  expect(screen.getByText('basics-form')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /com_life_archive_basics_collapse/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
