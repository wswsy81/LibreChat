/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import RulesPanel from '../admin/RulesPanel';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();

jest.mock('librechat-data-provider', () => ({
  request: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

const rulesDocument = {
  schemaVersion: 1,
  configurationVersion: 'v1',
  updatedAt: '2026-07-29T08:00:00Z',
  reason: '把写死在代码里的判据搬进配置',
  sha256: 'a'.repeat(64),
  rules: [
    {
      id: 'astrology-terms',
      status: 'published',
      severity: 'M',
      targets: ['artifact.narrative'],
      kind: 'forbid_any',
      params: { terms: ['八字', '星盘'], patterns: ['第?[0-9]{1,2}宫'] },
      action: 'reject',
      note: '前台零术语',
    },
    {
      id: 'question-budget',
      status: 'published',
      severity: 'M',
      targets: ['chat.reply'],
      kind: 'count_limit',
      params: { what: 'question_marks', max: 2 },
      action: 'observe',
    },
  ],
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RulesPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  mockPost.mockReset();
  mockGet.mockImplementation((url: string) =>
    String(url).includes('backups')
      ? Promise.resolve({
          backups: [{ rollbackId: '2026-07-29T07-00-00-000Z-abc', at: '2026-07-29T07:00:00' }],
        })
      : Promise.resolve(rulesDocument),
  );
});

test('列出运行中的规矩，标出管哪些、判断类型与违规处置', async () => {
  renderPanel();
  expect(await screen.findByText('astrology-terms')).toBeTruthy();
  expect(screen.getByText('artifact.narrative')).toBeTruthy();
  expect(screen.getByText('命中即违规')).toBeTruthy();
  expect(screen.getByText('2 个词 · 1 条正则')).toBeTruthy();
  expect(screen.getByText('拦下不落库')).toBeTruthy();
  expect(screen.getByText('只记账')).toBeTruthy();
});

test('保存把整份规矩表 PUT 上去，成功后提示生效条数', async () => {
  mockPut.mockResolvedValue({ sha256: 'b'.repeat(64), ruleCount: 2 });
  renderPanel();
  await screen.findByText('astrology-terms');

  await userEvent.click(screen.getByRole('button', { name: '保存并生效' }));

  await waitFor(() =>
    expect(mockPut).toHaveBeenCalledWith('/api/life/admin/rules', expect.any(Object)),
  );
  const [, body] = mockPut.mock.calls[0];
  expect(body.rules).toHaveLength(2);
  // 保存不得把配置改瘦：文件里的其他顶层字段必须原样带回去。
  expect(body.reason).toBe('把写死在代码里的判据搬进配置');
  expect(body.updatedAt).toBe('2026-07-29T08:00:00Z');
  expect(body.sha256).toBeUndefined();
  expect(await screen.findByText(/已生效：2 条规矩/)).toBeTruthy();
});

test('JSON 写坏时禁用保存按钮，并说清坏在哪', async () => {
  renderPanel();
  const draft = await screen.findByLabelText(/全文编辑/);
  await userEvent.clear(draft);
  await userEvent.type(draft, '{{ 坏掉的 JSON');

  expect(await screen.findByText(/JSON 有问题/)).toBeTruthy();
  expect(screen.getByRole('button', { name: '保存并生效' }).hasAttribute('disabled')).toBe(true);
  expect(mockPut).not.toHaveBeenCalled();
});

test('回滚点可一键回到旧版本', async () => {
  mockPost.mockResolvedValue({ sha256: 'c'.repeat(64) });
  renderPanel();
  await screen.findByText('astrology-terms');

  await userEvent.click(await screen.findByRole('button', { name: '回滚到这一版' }));

  await waitFor(() =>
    expect(mockPost).toHaveBeenCalledWith('/api/life/admin/rules/rollback', {
      rollbackId: '2026-07-29T07-00-00-000Z-abc',
    }),
  );
  expect(await screen.findByText('已回滚到所选版本')).toBeTruthy();
});
