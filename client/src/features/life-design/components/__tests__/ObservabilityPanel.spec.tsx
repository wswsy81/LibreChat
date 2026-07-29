/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import ObservabilityPanel from '../admin/ObservabilityPanel';

const mockGet = jest.fn();

jest.mock('librechat-data-provider', () => ({
  request: { get: (...args: unknown[]) => mockGet(...args) },
}));

const group = (variant: string, overrides: Record<string, unknown> = {}) => ({
  snapshotId: `${variant[0]}`.repeat(64),
  productId: 'futureline-current-v1',
  experiment: { id: 'advisor-pack-rollout-v1', variant },
  sampleSize: 4,
  successCount: 3,
  failureCount: 1,
  successRate: 0.75,
  latencyMs: { average: 180, p50: 170, p95: 320 },
  tokens: { total: 400, average: 100 },
  ...overrides,
});

const results = (groups: ReturnType<typeof group>[]) => ({
  schemaVersion: 1,
  source: 'futureline-product-observation-projection',
  truthSource: 'git-product-snapshot',
  individualTracesExposed: false,
  windowDays: 30,
  experimentId: null,
  generatedAt: '2026-07-29T10:00:00.000Z',
  groups,
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ObservabilityPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => mockGet.mockReset());

test('默认拉 30 天窗口，只渲染按产品/实验聚合的元数据', async () => {
  mockGet.mockResolvedValue(results([group('control'), group('candidate')]));
  renderPanel();

  await waitFor(() =>
    expect(mockGet).toHaveBeenCalledWith(
      '/api/life/admin/product-observability/results?windowDays=30',
    ),
  );
  expect(await screen.findAllByText('advisor-pack-rollout-v1 · control')).toHaveLength(1);
  expect(screen.getByText('advisor-pack-rollout-v1 · candidate')).toBeTruthy();
  expect(screen.getAllByText('75%')).toHaveLength(2);
  expect(screen.getAllByText('180 ms / 320 ms')).toHaveLength(2);
});

test('切换窗口只改 windowDays 查询，不传任何用户维度', async () => {
  mockGet.mockResolvedValue(results([group('control')]));
  renderPanel();
  await waitFor(() => expect(mockGet).toHaveBeenCalled());

  await userEvent.click(screen.getByRole('button', { name: '7 天' }));

  await waitFor(() =>
    expect(mockGet).toHaveBeenLastCalledWith(
      '/api/life/admin/product-observability/results?windowDays=7',
    ),
  );
  expect(mockGet.mock.calls.every(([url]) => !String(url).includes('user'))).toBe(true);
});

test('窗口内没有事件时给出空态而不是空表格', async () => {
  mockGet.mockResolvedValue(results([]));
  renderPanel();

  expect(await screen.findByText(/这个窗口还没有观测事件/)).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

test('读取失败时报错而不是渲染半张表', async () => {
  mockGet.mockRejectedValue(new Error('engine down'));
  renderPanel();

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('engine down');
});
