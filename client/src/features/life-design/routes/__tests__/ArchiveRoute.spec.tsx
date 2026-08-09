/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
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
jest.mock('../../components/PageState', () => ({
  LifeError: () => <div>life-error</div>,
  LifeLoading: () => <div>life-loading</div>,
}));

test('档案页明确当前领域，同时说明人物层仍跨领域共用', () => {
  render(
    <MemoryRouter>
      <ArchiveRoute />
    </MemoryRouter>,
  );

  expect(
    screen.getByText('com_life_archive_active_domain:com_life_map_house_h2'),
  ).toBeInTheDocument();
  expect(screen.getByText('com_life_archive_active_domain_help')).toBeInTheDocument();
});

test('完整档案不再复制现在的我，只保留指向 /me 的当前版本入口', () => {
  render(
    <MemoryRouter>
      <ArchiveRoute />
    </MemoryRouter>,
  );

  const selfLinks = screen.getAllByRole('link', { name: /com_life_archive_open_self/ });
  expect(selfLinks.length).toBeGreaterThan(0);
  for (const link of selfLinks) {
    expect(link.getAttribute('href')).toBe('/me');
  }
  expect(screen.queryByText('这段人物公式不应在完整档案重复出现')).not.toBeInTheDocument();
  expect(screen.queryByText('这段工作观不应在完整档案重复出现')).not.toBeInTheDocument();
  expect(screen.queryByText('这段恢复方式不应在完整档案重复出现')).not.toBeInTheDocument();
});

test('完整档案保留来源正文，并给重要人物、重大时刻和修订历史稳定扩展位', () => {
  render(
    <MemoryRouter>
      <ArchiveRoute />
    </MemoryRouter>,
  );

  expect(screen.getByText('archive-dossier')).toBeInTheDocument();
  expect(screen.getByText('archive-map')).toBeInTheDocument();
  expect(document.getElementById('archive-people')).not.toBeNull();
  expect(document.getElementById('archive-moments')).not.toBeNull();
  expect(document.getElementById('archive-revisions')).not.toBeNull();
});
