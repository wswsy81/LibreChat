/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import MapRoute from '../MapRoute';

const mockExplorer = jest.fn(() => <div data-testid="explorer" />);
const mockRefetch = jest.fn();
let mockBootstrap: Record<string, unknown>;

jest.mock('../../components/LifeWheel', () => ({
  Explorer: (props: unknown) => mockExplorer(props),
}));

jest.mock('../../components/PageState', () => ({
  LifeError: () => <div data-testid="error" />,
  LifeLoading: () => <div data-testid="loading" />,
}));

jest.mock('~/data-provider', () => ({
  useLifeBootstrapQuery: () => mockBootstrap,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const renderMap = () =>
  render(
    <MemoryRouter initialEntries={['/map']}>
      <MapRoute />
    </MemoryRouter>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockBootstrap = {
    isLoading: false,
    isError: false,
    refetch: mockRefetch,
    data: {
      user: { name: '登录名' },
      summary: { alias: '修文', lifeWheel: { schemaVersion: 1, lanternHouse: null, houses: [] } },
      domainConversations: [{ entryHouse: 'h6', conversationId: 'work-1' }],
    },
  };
});

test('独立生活地图复用权威圆轮和已有领域会话', () => {
  renderMap();

  expect(screen.getByText('com_life_map_page_title')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_map_direct_chat/ })).toHaveAttribute(
    'href',
    '/c/new',
  );
  expect(mockExplorer).toHaveBeenCalledWith(
    expect.objectContaining({
      archiveName: '修文',
      wheel: expect.objectContaining({ schemaVersion: 1 }),
      domainConversations: [{ entryHouse: 'h6', conversationId: 'work-1' }],
    }),
  );
});

test('地图加载和失败不猜测本地状态', () => {
  mockBootstrap = { isLoading: true };
  const loading = renderMap();
  expect(screen.getByTestId('loading')).toBeInTheDocument();
  loading.unmount();

  mockBootstrap = { isLoading: false, isError: true, refetch: mockRefetch };
  renderMap();
  expect(screen.getByTestId('error')).toBeInTheDocument();
});
