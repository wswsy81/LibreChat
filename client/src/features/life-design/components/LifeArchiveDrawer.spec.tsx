/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import LifeArchiveDrawer from './LifeArchiveDrawer';

const mockMutate = jest.fn();
let mockArchive: Record<string, unknown>;

jest.mock('~/data-provider', () => ({
  useLifeArchiveQuery: () => mockArchive,
  useLifeBootstrapQuery: () => ({
    data: { summary: { lifeWheel: { lanternHouse: 'h6', houses: [] } } },
  }),
  useLifeDossierAnnotateMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) =>
    key === 'com_life_reveal_opening' ? '够了。三个月、一年、三年——三条路都能开了。' : key,
}));

jest.mock('./ArchiveMistMap', () => () => <div data-testid="archive-map" />);

const baseStatus = {
  variableCount: 1,
  dossierClaimCount: 1,
  latestClaimId: 'claim-1',
  mapVersion: 'map-a',
  gateReached: false,
  openingAnnouncedAt: null,
};

const renderDrawer = (props?: Partial<React.ComponentProps<typeof LifeArchiveDrawer>>) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LifeArchiveDrawer isSubmitting={false} latestAssistantMessage={null} {...props} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockArchive = {
    data: {
      archiveStatus: baseStatus,
      recentDossier: [
        {
          id: 'claim-1',
          section: 'traits',
          text: '你要先看到能拿出去的东西，才肯停手。',
          quote: '我一直改，但是没有出产品。',
          status: 'draft',
          createdAt: '2026-07-31T00:00:00.000Z',
        },
      ],
    },
    isLoading: false,
  };
});

test('抽屉把手始终可见，普通存档变化只亮一次微光，不自动打开', () => {
  const view = renderDrawer();
  expect(
    screen.getByRole('button', { name: 'com_life_archive_drawer_handle' }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId('life-archive-glow')).not.toBeInTheDocument();

  mockArchive = {
    ...mockArchive,
    data: {
      ...(mockArchive.data as object),
      archiveStatus: { ...baseStatus, variableCount: 2 },
    },
  };
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <LifeArchiveDrawer isSubmitting={false} latestAssistantMessage={null} />
    </QueryClientProvider>,
  );

  expect(screen.getByTestId('life-archive-glow')).toBeInTheDocument();
  expect(screen.queryByTestId('archive-map')).not.toBeInTheDocument();
});

test('只有开幕宣布会自动打开一次', () => {
  mockArchive = {
    ...mockArchive,
    data: {
      ...(mockArchive.data as object),
      archiveStatus: {
        ...baseStatus,
        gateReached: true,
        openingAnnouncedAt: '2026-07-31T00:00:00.000Z',
      },
    },
  };
  const text = '够了。三个月、一年、三年——三条路都能开了。';
  const openingMessage = {
    messageId: 'opening-1',
    isCreatedByUser: false,
    text: '',
    content: [{ type: 'text', text }],
  } as TMessage;
  const view = renderDrawer({ latestAssistantMessage: openingMessage });
  expect(screen.getByTestId('archive-map')).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'com_life_archive_drawer_close' })[0]);
  expect(screen.queryByTestId('archive-map')).not.toBeInTheDocument();
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <LifeArchiveDrawer isSubmitting={false} latestAssistantMessage={openingMessage} />
    </QueryClientProvider>,
  );
  expect(screen.queryByTestId('archive-map')).not.toBeInTheDocument();
});

test('人物志条目可直接留下、改写或划掉', () => {
  renderDrawer();
  fireEvent.click(screen.getByRole('button', { name: 'com_life_archive_drawer_handle' }));

  fireEvent.click(screen.getByRole('button', { name: 'com_life_dossier_keep' }));
  expect(mockMutate).toHaveBeenCalledWith(
    { section: 'traits', entryId: 'claim-1', action: 'keep', text: undefined },
    expect.any(Object),
  );

  fireEvent.click(screen.getByRole('button', { name: 'com_life_dossier_rewrite' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '这是我自己的说法。' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_save' }));
  expect(mockMutate).toHaveBeenLastCalledWith(
    { section: 'traits', entryId: 'claim-1', action: 'rewrite', text: '这是我自己的说法。' },
    expect.any(Object),
  );
});

test('回合结束后持续刷新，后台归纳晚到也会更新抽屉并停止轮询', () => {
  jest.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const view = render(
    <QueryClientProvider client={client}>
      <LifeArchiveDrawer isSubmitting latestAssistantMessage={null} />
    </QueryClientProvider>,
  );

  view.rerender(
    <QueryClientProvider client={client}>
      <LifeArchiveDrawer isSubmitting={false} latestAssistantMessage={null} />
    </QueryClientProvider>,
  );
  expect(invalidate).toHaveBeenCalledWith([QueryKeys.lifeArchive]);
  expect(invalidate).toHaveBeenCalledWith([QueryKeys.lifeBootstrap]);

  invalidate.mockClear();
  act(() => jest.advanceTimersByTime(70_000));
  expect(invalidate).toHaveBeenCalledWith([QueryKeys.lifeArchive]);

  mockArchive = {
    ...mockArchive,
    data: {
      ...(mockArchive.data as object),
      archiveStatus: { ...baseStatus, dossierClaimCount: 2, latestClaimId: 'claim-2' },
    },
  };
  view.rerender(
    <QueryClientProvider client={client}>
      <LifeArchiveDrawer isSubmitting={false} latestAssistantMessage={null} />
    </QueryClientProvider>,
  );
  expect(screen.getByTestId('life-archive-glow')).toBeInTheDocument();

  invalidate.mockClear();
  act(() => jest.advanceTimersByTime(10_000));
  expect(invalidate).not.toHaveBeenCalled();
  view.unmount();
  jest.useRealTimers();
});

test('人物志没有变化时，后台刷新窗口也会在两分钟后自行停止', () => {
  jest.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const view = render(
    <QueryClientProvider client={client}>
      <LifeArchiveDrawer isSubmitting latestAssistantMessage={null} />
    </QueryClientProvider>,
  );

  view.rerender(
    <QueryClientProvider client={client}>
      <LifeArchiveDrawer isSubmitting={false} latestAssistantMessage={null} />
    </QueryClientProvider>,
  );
  act(() => jest.advanceTimersByTime(125_000));

  invalidate.mockClear();
  act(() => jest.advanceTimersByTime(10_000));
  expect(invalidate).not.toHaveBeenCalled();
  view.unmount();
  jest.useRealTimers();
});
