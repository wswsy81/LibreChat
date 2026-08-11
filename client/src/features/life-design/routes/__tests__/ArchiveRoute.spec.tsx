/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import ArchiveRoute from '../ArchiveRoute';

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const projection = {
  schemaVersion: 2,
  revision: 'projection_1234567890abcdef1234',
  birthDraft: {
    status: 'complete',
    missingFields: [],
    formula: '一个隐士，有着侦探的内核，戴着见证人的工作面具。',
    sun: { certainty: 'exact', name: '隐士', sign: '摩羯', meaning: '核心驱动' },
    moon: { certainty: 'exact', name: '侦探', sign: '天蝎', meaning: '内在需要' },
    rising: { certainty: 'exact', name: '见证人', sign: '双子', meaning: '对外方式' },
  },
  stateChain: [
    {
      id: 'experiment:exp-1',
      at: '2026-08-11T09:00:00.000Z',
      title: '一次现实验证',
      detail: '地图、试验和时间线共用此项',
      status: 'needs_adjustment',
      sourceType: 'experiment',
      sourceIds: ['event-1'],
      houseIds: ['h10'],
      surfaces: ['experiments', 'timeline', 'life_map'],
    },
  ],
  lifeWheel: { schemaVersion: 1, lanternHouse: 'h10', houses: [] },
};

jest.mock('~/data-provider', () => ({
  useLifeArchiveQuery: () => ({
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    data: {
      schemaVersion: 1,
      profileVersion: '2026-08-01T00:00:00.000Z',
      activeHouse: 'h2',
      profile: { alias: '修文', updatedAt: '2026-08-01T00:00:00.000Z' },
      reports: [
        { id: 'report-1', title: '一份历史报告', mode: 'discovery', createdAt: '2026-08-01' },
      ],
    },
  }),
  useLifeSelfProjectionQuery: () => ({
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    data: { schemaVersion: 2, projection, availability: { birthDraft: 'ready' } },
  }),
  useLifeBootstrapQuery: () => ({ data: { summary: { lifeWheel: { houses: [] } } } }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string>) =>
    values?.[0] ? `${key}:${values[0]}` : key,
}));

jest.mock('../../components/ArchiveDossier', () => () => <div>archive-dossier-history</div>);
jest.mock('../../components/ArchiveMistMap', () => () => <div>archive-map</div>);
jest.mock('../../components/BasicsForm', () => () => <div>basics-form</div>);
jest.mock('../MeRoute', () => ({ embedded }: { embedded?: boolean }) => (
  <>
    <section data-testid="current-self" data-embedded={String(Boolean(embedded))}>
      current-self
    </section>
    <section id="me-actor">actor</section>
    <section id="me-agent">agent</section>
    <section id="me-author">author</section>
    <section id="me-dynamics">dynamics</section>
    <section id="me-becoming">becoming</section>
  </>
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

test('目录第一层只有五个自我问题，地图、状态链、出生参考和来源降为工具', () => {
  renderArchive();

  expect(screen.getByTestId('current-self')).toHaveAttribute('data-embedded', 'true');
  for (const [name, href] of [
    ['com_life_me_actor_title', '/me#me-actor'],
    ['com_life_me_agent_title', '/me#me-agent'],
    ['com_life_me_author_title', '/me#me-author'],
    ['com_life_me_dynamics_title', '/me#me-dynamics'],
    ['com_life_me_becoming_title', '/me#me-becoming'],
  ]) {
    expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href);
  }
  expect(
    screen.queryByRole('link', { name: /com_life_archive_people_title/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /com_life_archive_moments_title/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('archive-map')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_me_birth_reference_title/ })).toHaveAttribute(
    'href',
    '/me#me-birth-reference',
  );
});

test('旧稿、改写、报告只在来源与修订展开后出现', async () => {
  renderArchive();

  expect(screen.queryByText('archive-dossier-history')).not.toBeInTheDocument();
  expect(screen.queryByText('一份历史报告')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /com_life_me_sources_expand/ }));

  expect(screen.getByText('archive-dossier-history')).toBeInTheDocument();
  expect(screen.getByText('一份历史报告')).toBeInTheDocument();
});

test('地图、试验与时间线从同一条状态链呈现', () => {
  renderArchive();

  expect(screen.getByText('一次现实验证')).toBeInTheDocument();
  expect(screen.getByText('地图、试验和时间线共用此项')).toBeInTheDocument();
  expect(screen.getByText('com_life_me_surface_experiments')).toBeInTheDocument();
  expect(screen.getByText('com_life_me_surface_timeline')).toBeInTheDocument();
  expect(screen.getByText('com_life_me_surface_life_map')).toBeInTheDocument();
});

test('出生参考默认收起，不进入五章正文', async () => {
  renderArchive();

  expect(screen.queryByText('摩羯／隐士')).not.toBeInTheDocument();
  expect(screen.queryByText(/一个隐士/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /com_life_me_birth_reference_expand/ }));

  expect(screen.getByText('摩羯／隐士')).toBeInTheDocument();
  expect(screen.queryByText(/一个隐士/)).not.toBeInTheDocument();
});

test('/me#me-becoming 会由深链滚动合同定位到第五章', async () => {
  Element.prototype.scrollIntoView = jest.fn();
  renderArchive('/me#me-becoming');

  await waitFor(() =>
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' }),
  );
  expect(document.getElementById('me-becoming')).toBeInTheDocument();
});

test('/me#me-sources 会自动展开来源层，布局变化后重新定位', async () => {
  const scrollIntoView = jest.fn();
  let resize: ResizeObserverCallback | undefined;
  Element.prototype.scrollIntoView = scrollIntoView;
  window.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resize = callback;
    }

    observe() {}

    unobserve() {}

    disconnect() {}
  };
  renderArchive('/me#me-sources');

  expect(screen.getByText('archive-dossier-history')).toBeInTheDocument();
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  resize?.([{ contentRect: { height: 2000 } } as ResizeObserverEntry], {} as ResizeObserver);
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
});

test('/me#me-birth-reference 会打开可选出生参考并定位', async () => {
  Element.prototype.scrollIntoView = jest.fn();
  renderArchive('/me#me-birth-reference');

  expect(screen.getByText('摩羯／隐士')).toBeInTheDocument();
  await waitFor(() =>
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' }),
  );
});

test('基本资料依然默认收起，只在第二层修改', async () => {
  renderArchive();

  expect(screen.queryByText('basics-form')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /com_life_archive_basics_expand/ }));
  expect(screen.getByText('basics-form')).toBeInTheDocument();
});
