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
jest.mock('../../components/LifeWheel', () => ({ Explorer: () => <div>explorer</div> }));
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
