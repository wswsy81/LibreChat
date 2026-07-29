import type { RunLLMConfig } from '~/types';
import { createProductSnapshot } from './productRuntime';
import { attachAdvisorRouteProof, prepareAdvisorRoute } from './route';

const flow = {
  schemaVersion: 1,
  id: 'futureline-advisor-route',
  version: 'v1',
  entry: 'route',
  permissions: ['conversation.read'],
  nodes: [
    {
      id: 'route',
      actionId: 'advisor.route',
      input: { route: 'advisor-gateway-v1', endpoint: 'polaris' },
    },
  ],
  edges: [{ from: 'route', to: 'END' }],
};

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
    schemaVersion: 1,
    flow,
    snapshot: createProductSnapshot({
      catalogVersion: 'v1',
      productId: 'futureline-current-v1',
      skills: [{ id: 'advisor-dialogue', version: 'v1', sha256: 'a'.repeat(64) }],
      plugins: [{ id: 'mcp-ui-resource', version: 'v1', sha256: pluginSha256 }],
      pi: [],
      createdAt: '2026-07-28T00:00:00.000Z',
    }),
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

  it('runs the real LangGraph flow and returns the sole action effect as route proof', async () => {
    expect(contract().snapshot.snapshotId).toMatch(/^[a-f0-9]{64}$/);
    const proof = await prepareAdvisorRoute(identity, {
      enabled: true,
      engineUrl: 'http://future-engine:8899/',
      internalToken: 'internal-token',
      fetchImpl: fetchContract(),
    });
    expect(proof).toBeDefined();
    expect(proof?.endpoint).toBe('polaris');
    expect(proof?.headers['X-Futureline-Product-Snapshot']).toMatch(/^[a-f0-9]{64}$/);
    expect(proof?.headers['X-Futureline-Product-Run']).toMatch(/^advisor-[a-f0-9]{32}$/);
    expect(proof?.headers['X-Futureline-Product-Effect']).toMatch(/^[a-f0-9]{64}$/);

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
          flow: { ...flow, nodes: [{ ...flow.nodes[0], actionId: 'model.generate' }] },
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
