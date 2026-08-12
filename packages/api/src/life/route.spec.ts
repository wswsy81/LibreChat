import { createHash } from 'node:crypto';
import type { RunLLMConfig } from '~/types';
import { createProductSnapshot } from './productRuntime';
import { attachAdvisorRouteProof, prepareAdvisorRoute, resolveAdvisorMode } from './route';

const flow = {
  schemaVersion: 1,
  id: 'futureline-advisor-mode-route',
  version: 'v2',
  entry: 'select-mode',
  permissions: ['conversation.read'],
  nodes: [
    {
      id: 'select-mode',
      actionId: 'advisor.select-mode',
      input: { defaultMode: 'free_chat' },
    },
    {
      id: 'route-free-chat',
      actionId: 'advisor.route',
      input: {
        route: 'advisor-gateway-v1',
        endpoint: 'polaris',
        mode: 'free_chat',
        promptSlot: 'advisor.prompt.free-chat',
      },
    },
    {
      id: 'route-guided-interview',
      actionId: 'advisor.route',
      input: {
        route: 'advisor-gateway-v1',
        endpoint: 'polaris',
        mode: 'guided_interview',
        promptSlot: 'advisor.prompt.guided-interview',
      },
    },
    {
      id: 'route-tool-action',
      actionId: 'advisor.route',
      input: {
        route: 'advisor-gateway-v1',
        endpoint: 'polaris',
        mode: 'tool_action',
        promptSlot: 'advisor.prompt.tool-action',
      },
    },
    {
      id: 'route-report',
      actionId: 'advisor.route',
      input: {
        route: 'advisor-gateway-v1',
        endpoint: 'polaris',
        mode: 'report',
        promptSlot: 'advisor.prompt.report',
      },
    },
    {
      id: 'route-mingli',
      actionId: 'advisor.route',
      input: {
        route: 'advisor-gateway-v1',
        endpoint: 'polaris',
        mode: 'mingli',
        promptSlot: 'advisor.prompt.mingli',
      },
    },
  ],
  edges: [
    {
      from: 'select-mode',
      to: 'route-guided-interview',
      when: { fact: 'requested_mode', op: 'eq', value: 'guided_interview' },
    },
    {
      from: 'select-mode',
      to: 'route-tool-action',
      when: { fact: 'requested_mode', op: 'eq', value: 'tool_action' },
    },
    {
      from: 'select-mode',
      to: 'route-report',
      when: { fact: 'requested_mode', op: 'eq', value: 'report' },
    },
    {
      from: 'select-mode',
      to: 'route-mingli',
      when: { fact: 'requested_mode', op: 'eq', value: 'mingli' },
    },
    { from: 'select-mode', to: 'route-free-chat' },
    { from: 'route-free-chat', to: 'END' },
    { from: 'route-guided-interview', to: 'END' },
    { from: 'route-tool-action', to: 'END' },
    { from: 'route-report', to: 'END' },
    { from: 'route-mingli', to: 'END' },
  ],
};

const prompt = (slot: string, content: string) => ({
  slot,
  sha256: createHash('sha256').update(content).digest('hex'),
  content,
});

const prompts = [
  prompt(
    'advisor.prompt.core',
    '轻量核心：自然聊天，事实诚实，安全边界。\n\n【可选方法工具箱】\n人生设计是可选方法，不是固定流程。',
  ),
  prompt('advisor.prompt.free-chat', '普通聊天：直接回应，不启动流程。'),
  prompt('advisor.prompt.guided-interview', '阶段访谈：一次只问一项。'),
  prompt('advisor.prompt.tool-action', '工具执行：完成明确任务。'),
  prompt('advisor.prompt.report', '报告：只使用已确认材料。'),
  prompt('advisor.prompt.mingli', '命理：只做现实对答案。'),
];

const pluginSha256 = 'c'.repeat(64);
const pluginManifest = {
  schemaVersion: 1,
  id: 'mcp-ui-resource',
  version: 'v1',
  status: 'deployed',
  kind: 'product_plugin',
  actions: [],
  scopes: [],
  clientPrimitiveId: 'mcp-ui-resource',
  minHostVersion: '0.8.7',
  payloadSchema: {
    schemaVersion: 1,
    id: 'mcp-ui-resource-payload',
    fields: [
      { name: 'uri', type: 'ui_uri', required: true, maxLength: 256 },
      { name: 'mimeType', type: 'mime_type', required: true, maxLength: 64 },
      { name: 'text', type: 'html', required: true, maxLength: 200000 },
    ],
  },
};

function contract() {
  return {
    schemaVersion: 2,
    flow,
    snapshot: createProductSnapshot({
      catalogVersion: 'v1',
      productId: 'futureline-current-v1',
      skills: [{ id: 'advisor-dialogue', version: 'v1', sha256: 'a'.repeat(64) }],
      plugins: [{ id: 'mcp-ui-resource', version: 'v1', sha256: pluginSha256 }],
      pi: [],
      createdAt: '2026-07-28T00:00:00.000Z',
    }),
    prompts,
    plugins: [{ sha256: pluginSha256, manifest: pluginManifest }],
  };
}

const identity = {
  requestBody: {
    spec: 'future-lines',
    conversationId: 'conversation-1',
    messageId: 'turn-1',
    parentMessageId: 'user-message-1',
  },
  user: { id: 'user-1' },
};

function fetchContract(value: unknown = contract(), status = 200) {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  }));
}

describe('Advisor Product Runner route', () => {
  it('does nothing when disabled or when the model spec is not future-lines', async () => {
    const fetchImpl = fetchContract();
    await expect(
      prepareAdvisorRoute(identity, { enabled: false, fetchImpl }),
    ).resolves.toBeUndefined();
    await expect(
      prepareAdvisorRoute(
        { ...identity, requestBody: { ...identity.requestBody, spec: 'other' } },
        { enabled: true, fetchImpl },
      ),
    ).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs the real LangGraph mode flow and returns the selected route effect as proof', async () => {
    expect(contract().snapshot.snapshotId).toMatch(/^[a-f0-9]{64}$/);
    const proof = await prepareAdvisorRoute(identity, {
      enabled: true,
      engineUrl: 'http://future-engine:8899/',
      internalToken: 'internal-token',
      fetchImpl: fetchContract(),
    });
    expect(proof).toBeDefined();
    expect(proof?.endpoint).toBe('polaris');
    expect(proof?.mode).toBe('free_chat');
    expect(proof?.prompts).toEqual({
      core: '轻量核心：自然聊天，事实诚实，安全边界。\n\n【可选方法工具箱】\n人生设计是可选方法，不是固定流程。',
      modeCard: '普通聊天：直接回应，不启动流程。',
    });
    expect(proof?.headers['X-Futureline-Product-Snapshot']).toMatch(/^[a-f0-9]{64}$/);
    expect(proof?.headers['X-Futureline-Product-Run']).toMatch(/^advisor-[a-f0-9]{32}$/);
    expect(proof?.headers['X-Futureline-Product-Effect']).toMatch(/^[a-f0-9]{64}$/);
    expect(proof?.headers['X-Futureline-Product-Mode']).toBe('free_chat');

    const fetchImpl = fetchContract();
    await prepareAdvisorRoute(identity, {
      enabled: true,
      engineUrl: 'http://future-engine:8899/',
      internalToken: 'internal-token',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://future-engine:8899/internal/product-runtime/advisor',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ principalId: 'user-1', conversationId: 'conversation-1' }),
      }),
    );

    const llmConfig = {
      provider: 'openAI',
      streaming: true,
      streamUsage: false,
      configuration: { defaultHeaders: { Existing: 'kept' } },
    } as unknown as RunLLMConfig;
    expect(attachAdvisorRouteProof('other', llmConfig, proof)).toBe(false);
    expect(attachAdvisorRouteProof('polaris', llmConfig, proof)).toBe(true);
    expect(llmConfig.configuration?.defaultHeaders).toEqual({
      Existing: 'kept',
      ...proof?.headers,
    });
  });

  it('routes only strong deterministic signals and defaults unrelated stories to free_chat', async () => {
    expect(
      resolveAdvisorMode([{ role: 'user', content: '今天在楼下碰到以前的同学，聊了十分钟。' }]),
    ).toBe('free_chat');
    expect(
      resolveAdvisorMode([{ role: 'user', content: '[trigger:house_entered] entryHouse=h10' }]),
    ).toBe('guided_interview');
    expect(resolveAdvisorMode([{ role: 'user', content: '我想了解下自己，你来问我吧' }])).toBe(
      'free_chat',
    );
    expect(resolveAdvisorMode([{ role: 'user', content: '开始人生设计' }])).toBe('free_chat');
    expect(resolveAdvisorMode([{ role: 'user', content: '帮我生成这次的完整报告' }])).toBe(
      'report',
    );
    expect(resolveAdvisorMode([{ role: 'user', content: '用八字和星盘对一下这个选择' }])).toBe(
      'mingli',
    );
    expect(
      resolveAdvisorMode([{ role: 'user', content: '朋友昨天给我发了张星盘，我还没点开。' }]),
    ).toBe('free_chat');
    expect(resolveAdvisorMode([{ role: 'user', content: '帮我联网查一下这家公司' }])).toBe(
      'tool_action',
    );
    expect(resolveAdvisorMode([{ role: 'tool', content: '查询完成' }])).toBe('tool_action');

    const proof = await prepareAdvisorRoute(
      { ...identity, messages: [{ role: 'user', content: '用八字看看今年的工作选择' }] },
      {
        enabled: true,
        engineUrl: 'http://future-engine',
        internalToken: 'token',
        fetchImpl: fetchContract(),
      },
    );
    expect(proof?.mode).toBe('mingli');
    expect(proof?.prompts.modeCard).toBe('命理：只做现实对答案。');
  });

  it('keeps an explicitly entered astrology service active across direct follow-ups and exits cleanly', () => {
    const entered = [
      { role: 'user', content: '我想看星盘' },
      { role: 'assistant', content: '可以，我们先确认出生资料。' },
      { role: 'user', content: '那我现在去输入出生信息？' },
    ];
    expect(resolveAdvisorMode(entered)).toBe('mingli');

    const saved = [
      ...entered,
      { role: 'assistant', content: '可以，填好后回来继续。' },
      { role: 'user', content: '我已经填写好了，现在有什么变化我能看到吗？' },
    ];
    expect(resolveAdvisorMode(saved)).toBe('mingli');

    expect(
      resolveAdvisorMode([
        ...saved,
        { role: 'assistant', content: '出生参考已经生成，我们可以继续看。' },
        { role: 'user', content: '先不聊这个了，换个话题，说说明天的会议。' },
      ]),
    ).toBe('free_chat');
    expect(
      resolveAdvisorMode([
        ...saved,
        { role: 'assistant', content: '出生参考已经生成，我们可以继续看。' },
        { role: 'user', content: '帮我生成这次的完整报告' },
      ]),
    ).toBe('report');

    expect(resolveAdvisorMode([{ role: 'user', content: '我已经填好了' }])).toBe('free_chat');
    expect(
      resolveAdvisorMode([{ role: 'user', content: '朋友昨天给我发了张星盘，我还没点开。' }]),
    ).toBe('free_chat');
  });

  it('retains experiment assignment in the validated snapshot digest', async () => {
    const assigned = contract();
    assigned.snapshot = createProductSnapshot({
      catalogVersion: 'v1',
      productId: 'futureline-current-v1',
      skills: [{ id: 'advisor-dialogue', version: 'v1', sha256: 'a'.repeat(64) }],
      plugins: [{ id: 'mcp-ui-resource', version: 'v1', sha256: pluginSha256 }],
      pi: [],
      experiment: { id: 'advisor-pack-rollout-v1', variant: 'control' },
      createdAt: '2026-07-28T00:00:00.000Z',
    });
    const proof = await prepareAdvisorRoute(identity, {
      enabled: true,
      engineUrl: 'http://future-engine',
      internalToken: 'token',
      fetchImpl: fetchContract(assigned),
    });
    expect(proof?.headers['X-Futureline-Product-Snapshot']).toBe(assigned.snapshot.snapshotId);
  });

  it.each(['conversationId', 'messageId', 'parentMessageId'] as const)(
    'fails closed when %s is missing',
    async (field) => {
      const requestBody: Partial<typeof identity.requestBody> = { ...identity.requestBody };
      delete requestBody[field];
      await expect(
        prepareAdvisorRoute(
          { ...identity, requestBody },
          { enabled: true, fetchImpl: fetchContract() },
        ),
      ).rejects.toThrow(field);
    },
  );

  it('fails closed when the trusted principal is missing', async () => {
    await expect(
      prepareAdvisorRoute({ ...identity, user: {} }, { enabled: true, fetchImpl: fetchContract() }),
    ).rejects.toThrow('user.id');
  });

  it('rejects malformed flow, snapshot, action and fetch responses', async () => {
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({ ...contract(), flow: { ...flow, permissions: [] } }),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('permissions');
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({
          ...contract(),
          flow: {
            ...flow,
            nodes: flow.nodes.map((node, index) =>
              index === 1 ? { ...node, actionId: 'model.generate' } : node,
            ),
          },
        }),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('action');
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({
          ...contract(),
          prompts: prompts.map((item, index) =>
            index === 0 ? { ...item, content: `${item.content}被篡改` } : item,
          ),
        }),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('digest');
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({
          ...contract(),
          snapshot: { ...contract().snapshot, snapshotId: 'b'.repeat(64) },
        }),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('digest');
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({
          ...contract(),
          plugins: [
            {
              sha256: pluginSha256,
              manifest: { ...pluginManifest, minHostVersion: '0.8.8' },
            },
          ],
        }),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('requires host 0.8.8');
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({
          ...contract(),
          plugins: [{ sha256: 'd'.repeat(64), manifest: pluginManifest }],
        }),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('snapshot mismatch');
    await expect(
      prepareAdvisorRoute(identity, {
        enabled: true,
        fetchImpl: fetchContract({}, 503),
        engineUrl: 'http://future-engine',
        internalToken: 'token',
      }),
    ).rejects.toThrow('503');
  });
});
