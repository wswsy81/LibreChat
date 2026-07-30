const { EventEmitter } = require('events');

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockGenerationJobManager = {
  createJob: jest.fn(),
  getJob: jest.fn(),
  emitError: jest.fn(),
  completeJob: jest.fn(),
  getResumeState: jest.fn(),
  updateMetadata: jest.fn(),
};

const mockCheckAndIncrementPendingRequest = jest.fn();
const mockDecrementPendingRequest = jest.fn();
const mockFilterPersistableAbortContent = jest.fn((content) =>
  content.filter((part) => part?.type !== 'tool_call'),
);
const mockGetConvo = jest.fn();
const mockGetMessages = jest.fn();
const mockSaveMessage = jest.fn();
const mockResolveChatSubmissionIdentity = jest.fn(async ({ input }) => {
  const stable = Buffer.from(
    `${input.userId}:${input.conversationId}:${input.parentMessageId}:${input.text}`,
  )
    .toString('hex')
    .slice(0, 20);
  return {
    submissionKey: stable.padEnd(64, '0'),
    userMessageId: `stable-user-${stable}`,
    responseMessageId: `stable-response-${stable}`,
    source: 'derived',
  };
});
const mockDeriveChatConversationId = jest.fn(({ userId, clientMessageId }) =>
  Buffer.from(`${userId}:${clientMessageId}`).toString('hex').slice(0, 8).padEnd(36, '0'),
);
let mockMCPContexts = new WeakMap();

const mockCreateMCPRequestContext = jest.fn(() => ({
  connections: new Map(),
  pending: new Map(),
  cleanupStarted: false,
  cleanupOnResponse: false,
  responseCleanupAttached: false,
}));
const mockGetMCPRequestContext = jest.fn((req) => {
  if (!req) {
    return undefined;
  }

  let context = mockMCPContexts.get(req);
  if (!context) {
    context = mockCreateMCPRequestContext();
    mockMCPContexts.set(req, context);
  }

  return context.cleanupStarted ? undefined : context;
});
const mockCleanupMCPRequestContext = jest.fn(async (context) => {
  if (!context || context.cleanupStarted) {
    return;
  }

  context.cleanupStarted = true;
  const connections = new Set(context.connections.values());
  const settled = await Promise.allSettled(context.pending.values());
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      connections.add(result.value);
    }
  }

  await Promise.allSettled(Array.from(connections).map((connection) => connection.disconnect?.()));
  context.connections.clear();
  context.pending.clear();
});
const mockCleanupMCPRequestContextForReq = jest.fn(async (req) => {
  const context = mockMCPContexts.get(req);
  if (!context) {
    return;
  }

  try {
    await mockCleanupMCPRequestContext(context);
  } finally {
    mockMCPContexts.delete(req);
  }
});

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  getViolationInfo: jest.fn(),
  buildMessageFiles: jest.fn(() => []),
  resolveTitleTiming: jest.fn(() => 'immediate'),
  GenerationJobManager: mockGenerationJobManager,
  getReferencedQuotes: jest.fn((quotes) => {
    if (!Array.isArray(quotes)) {
      return null;
    }
    const normalized = quotes
      .filter((quote) => typeof quote === 'string' && quote.trim().length > 0)
      .map((quote) => quote.trim());
    return normalized.length > 0 ? normalized : null;
  }),
  cleanupMCPRequestContext: (...args) => mockCleanupMCPRequestContext(...args),
  createMCPRequestContext: (...args) => mockCreateMCPRequestContext(...args),
  getMCPRequestContext: (...args) => mockGetMCPRequestContext(...args),
  filterPersistableAbortContent: (...args) => mockFilterPersistableAbortContent(...args),
  cleanupMCPRequestContextForReq: (...args) => mockCleanupMCPRequestContextForReq(...args),
  decrementPendingRequest: (...args) => mockDecrementPendingRequest(...args),
  sanitizeMessageForTransmit: jest.fn((message) => message),
  checkAndIncrementPendingRequest: (...args) => mockCheckAndIncrementPendingRequest(...args),
  deriveChatConversationId: (...args) => mockDeriveChatConversationId(...args),
  isUnpersistedPreliminaryParent: async ({
    userId,
    conversationId,
    parentMessageId,
    getMessages,
  }) => {
    if (typeof parentMessageId !== 'string' || !parentMessageId.endsWith('_')) {
      return false;
    }

    const filter = { user: userId, messageId: parentMessageId };
    if (conversationId && conversationId !== 'new') {
      filter.conversationId = conversationId;
    }

    const messages = await getMessages(filter, '_id');
    return messages.length === 0;
  },
  resolveChatSubmissionIdentity: (...args) => mockResolveChatSubmissionIdentity(...args),
}));

jest.mock('~/server/cleanup', () => ({
  disposeClient: jest.fn(),
  clientRegistry: null,
  requestDataMap: {
    set: jest.fn(),
  },
}));

jest.mock('~/server/middleware', () => ({
  handleAbortError: jest.fn(() => Promise.resolve()),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  getMessages: (...args) => mockGetMessages(...args),
  getConvo: (...args) => mockGetConvo(...args),
}));

const AgentController = require('../request');
const { getMCPRequestContext } = require('~/server/services/MCPRequestContext');

function createResumableResponse() {
  const res = new EventEmitter();
  res.headersSent = false;
  res.writableEnded = false;
  res.finished = false;
  res.destroyed = false;
  res.json = jest.fn(() => {
    res.headersSent = true;
    res.writableEnded = true;
    res.finished = true;
    res.emit('finish');
    return res;
  });
  res.status = jest.fn(() => res);
  return res;
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ResumableAgentController resume metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMCPContexts = new WeakMap();
    mockCheckAndIncrementPendingRequest.mockResolvedValue({ allowed: true });
    mockDecrementPendingRequest.mockResolvedValue(undefined);
    mockGetConvo.mockResolvedValue({ createdAt: '2026-06-07T00:00:00.000Z' });
    mockGetMessages.mockResolvedValue([]);
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: { on: jest.fn() },
    });
    mockGenerationJobManager.getJob.mockResolvedValue(undefined);
    mockGenerationJobManager.getResumeState.mockResolvedValue(null);
    mockGenerationJobManager.updateMetadata.mockResolvedValue(undefined);
    mockGenerationJobManager.emitError.mockResolvedValue(undefined);
    mockSaveMessage.mockResolvedValue({});
  });

  it('rejects an underscore-suffixed parent that is not persisted', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn();
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Follow up too early.',
        messageId: 'follow-up-user',
        parentMessageId: 'pending-response_',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          modelOptions: { model: 'gpt-3.5-turbo' },
        },
      },
      config: {},
    };
    const res = {
      json: jest.fn(),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGetMessages).toHaveBeenCalledWith(
      { user: 'user-123', messageId: 'pending-response_', conversationId },
      '_id',
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('selected parent response is still being saved'),
      }),
    );
    expect(mockCheckAndIncrementPendingRequest).not.toHaveBeenCalled();
    expect(mockGenerationJobManager.createJob).not.toHaveBeenCalled();
    expect(initializeClient).not.toHaveBeenCalled();
  });

  it('allows an underscore-suffixed parent when it is already persisted', async () => {
    const conversationId = 'conversation-123';
    mockGetMessages.mockResolvedValue([{ _id: 'persisted-parent' }]);
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Follow up to persisted underscore id.',
        messageId: 'follow-up-user',
        parentMessageId: 'persisted-response_',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          modelOptions: { model: 'gpt-3.5-turbo' },
        },
      },
      config: {},
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGetMessages).toHaveBeenCalledWith(
      { user: 'user-123', messageId: 'persisted-response_', conversationId },
      '_id',
    );
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(mockCheckAndIncrementPendingRequest).toHaveBeenCalledWith('user-123');
    expect(mockGenerationJobManager.createJob).toHaveBeenCalledWith(
      conversationId,
      'user-123',
      conversationId,
    );
  });

  it('stores the in-flight turn before MCP initialization can emit OAuth', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Check Google Workspace availability.',
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          iconURL: 'https://example.com/spec-icon.png',
          modelOptions: { model: 'gpt-3.5-turbo' },
        },
      },
      config: {},
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGenerationJobManager.updateMetadata).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        conversationId,
        endpoint: 'agents',
        iconURL: 'https://example.com/spec-icon.png',
        model: 'gpt-3.5-turbo',
        responseMessageId: expect.stringMatching(/^stable-response-/),
        userMessage: {
          messageId: expect.stringMatching(/^stable-user-/),
          parentMessageId: 'original-response',
          conversationId,
          text: 'Check Google Workspace availability.',
        },
      }),
    );
    expect(mockGenerationJobManager.updateMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      initializeClient.mock.invocationCallOrder[0],
    );
  });

  it('resolves the same logical fresh submission to stable server turn ids', async () => {
    const conversationId = 'conversation-stable-submit';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const buildReq = (messageId) => ({
      user: { id: 'user-123' },
      body: {
        text: '可以，你给下意见',
        messageId,
        parentMessageId: 'assistant-parent-1',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    });

    await AgentController(
      buildReq('client-message-1'),
      createResumableResponse(),
      jest.fn(),
      initializeClient,
      null,
    );
    await AgentController(
      buildReq('client-message-2'),
      createResumableResponse(),
      jest.fn(),
      initializeClient,
      null,
    );

    const metadataWrites = mockGenerationJobManager.updateMetadata.mock.calls.map(
      (call) => call[1],
    );
    expect(metadataWrites).toHaveLength(2);
    expect(metadataWrites[0].userMessage.messageId).toBe(metadataWrites[1].userMessage.messageId);
    expect(metadataWrites[0].responseMessageId).toBe(metadataWrites[1].responseMessageId);
    expect(metadataWrites[0].userMessage.messageId).not.toMatch(/^client-message-/);
  });

  it('marks the stable user id as the primary response lane so BaseClient persists it', async () => {
    const req = {
      user: { id: 'user-123' },
      body: {
        text: '普通提交必须保存用户消息',
        messageId: 'client-message-id',
        parentMessageId: 'assistant-parent-1',
        conversationId: 'conversation-stable-submit',
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    };
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));

    await AgentController(req, createResumableResponse(), jest.fn(), initializeClient, null);

    expect(req.body.messageId).toMatch(/^stable-user-/);
    expect(req.body.overrideUserMessageId).toBe(`${req.body.messageId}__0`);
  });

  it('keeps a retried new-chat POST on the same derived conversation stream', async () => {
    const buildReq = () => ({
      user: { id: 'user-123' },
      body: {
        text: '第一条消息',
        messageId: 'client-new-chat-message',
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        conversationId: null,
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    });
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));

    await AgentController(buildReq(), createResumableResponse(), jest.fn(), initializeClient, null);
    await AgentController(buildReq(), createResumableResponse(), jest.fn(), initializeClient, null);

    expect(mockDeriveChatConversationId).toHaveBeenCalledTimes(2);
    const streamIds = mockGenerationJobManager.createJob.mock.calls.map((call) => call[0]);
    expect(streamIds).toHaveLength(2);
    expect(streamIds[1]).toBe(streamIds[0]);
    const identityConversationIds = mockResolveChatSubmissionIdentity.mock.calls.map(
      ([{ input }]) => input.conversationId,
    );
    expect(identityConversationIds.at(-1)).toBe(identityConversationIds.at(-2));
  });

  it('preserves explicit multi-response override ids instead of treating them as a fresh turn', async () => {
    const conversationId = 'conversation-multi-response';
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Compare two responses',
        messageId: 'optimistic-user-id',
        parentMessageId: 'assistant-parent-1',
        conversationId,
        overrideConvoId: `${conversationId}__1`,
        overrideUserMessageId: 'shared-user-id__1',
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    };
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));

    await AgentController(req, createResumableResponse(), jest.fn(), initializeClient, null);

    expect(mockResolveChatSubmissionIdentity).not.toHaveBeenCalled();
    expect(req.body.overrideConvoId).toBe(`${conversationId}__1`);
    expect(req.body.overrideUserMessageId).toBe('shared-user-id__1');
  });

  it('reuses the matching in-flight job before concurrency accounting or initialization', async () => {
    const conversationId = 'conversation-active-submit';
    const req = {
      user: { id: 'user-123' },
      body: {
        text: '可以，你给下意见',
        messageId: 'client-message-remounted',
        parentMessageId: 'assistant-parent-1',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    };
    const identity = await mockResolveChatSubmissionIdentity({
      input: {
        userId: req.user.id,
        conversationId,
        parentMessageId: req.body.parentMessageId,
        text: req.body.text,
      },
    });
    mockGenerationJobManager.getJob.mockResolvedValue({
      status: 'running',
      metadata: {
        userId: req.user.id,
        conversationId,
        userMessage: { messageId: identity.userMessageId },
        responseMessageId: identity.responseMessageId,
      },
    });
    const res = createResumableResponse();
    const initializeClient = jest.fn();

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(res.json).toHaveBeenCalledWith({
      streamId: conversationId,
      conversationId,
      status: 'started',
      reused: true,
    });
    expect(mockCheckAndIncrementPendingRequest).not.toHaveBeenCalled();
    expect(mockGenerationJobManager.createJob).not.toHaveBeenCalled();
    expect(mockGenerationJobManager.updateMetadata).not.toHaveBeenCalled();
    expect(initializeClient).not.toHaveBeenCalled();
  });

  it('asks a racing duplicate to retry while the first matching job is still being published', async () => {
    const conversationId = 'conversation-racing-submit';
    const buildReq = () => ({
      user: { id: 'user-123' },
      body: {
        text: '可以，你给下意见',
        messageId: 'client-message-race',
        parentMessageId: 'assistant-parent-1',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    });
    let releaseFirstCreate;
    mockGenerationJobManager.createJob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstCreate = () =>
            resolve({
              createdAt: 1000,
              readyPromise: Promise.resolve(),
              abortController: new AbortController(),
              emitter: { on: jest.fn() },
            });
        }),
    );
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const firstResponse = createResumableResponse();
    const first = AgentController(buildReq(), firstResponse, jest.fn(), initializeClient, null);

    await nextTick();

    const racingResponse = createResumableResponse();
    await AgentController(buildReq(), racingResponse, jest.fn(), initializeClient, null);

    expect(racingResponse.status).toHaveBeenCalledWith(503);
    expect(racingResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SERVER_NOT_READY' }),
    );
    expect(mockCheckAndIncrementPendingRequest).toHaveBeenCalledTimes(1);
    expect(mockGenerationJobManager.createJob).toHaveBeenCalledTimes(1);

    releaseFirstCreate();
    await first;
  });

  it('releases the startup key when job creation fails so the same submission can retry', async () => {
    const conversationId = 'conversation-create-retry';
    const buildReq = () => ({
      user: { id: 'user-123' },
      body: {
        text: '创建 job 失败后重试',
        messageId: 'client-message-retry',
        parentMessageId: 'assistant-parent-1',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          agent_id: 'agent-life-design',
          modelOptions: { model: 'gpt-5.6-sol' },
        },
      },
      config: {},
    });
    mockGenerationJobManager.createJob
      .mockRejectedValueOnce(new Error('job store unavailable'))
      .mockResolvedValueOnce({
        createdAt: 1000,
        readyPromise: Promise.resolve(),
        abortController: new AbortController(),
        emitter: { on: jest.fn() },
      });
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const firstResponse = createResumableResponse();

    await AgentController(buildReq(), firstResponse, jest.fn(), initializeClient, null);
    expect(firstResponse.status).toHaveBeenCalledWith(500);

    const retryResponse = createResumableResponse();
    await AgentController(buildReq(), retryResponse, jest.fn(), initializeClient, null);

    expect(retryResponse.status).not.toHaveBeenCalledWith(503);
    expect(mockGenerationJobManager.createJob).toHaveBeenCalledTimes(2);
    expect(retryResponse.json).toHaveBeenCalledWith({
      streamId: conversationId,
      conversationId,
      status: 'started',
    });
  });

  it('keeps request-scoped MCP connections until resumable initialization finishes', async () => {
    const conversationId = 'conversation-123';
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const initializeClient = jest.fn(async ({ req, res }) => {
      const context = getMCPRequestContext(req, res);
      context.connections.set('mcp-server', { disconnect });

      await nextTick();
      expect(disconnect).not.toHaveBeenCalled();

      throw new Error('stop after request-scoped MCP connection');
    });
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use a BODY-scoped MCP server.',
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          modelOptions: { model: 'gpt-4.1' },
        },
      },
      config: {},
    };
    const res = createResumableResponse();

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(res.json).toHaveBeenCalledWith({
      streamId: conversationId,
      conversationId,
      status: 'started',
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      mockDecrementPendingRequest.mock.invocationCallOrder[0],
    );
  });

  it('stores model spec icon fallbacks and agent ids in early resume metadata', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use the resume spec.',
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          spec: 'agent-spec',
          agent_id: 'agent_resume_spec',
          model_parameters: { model: 'gpt-4.1' },
        },
      },
      config: {
        modelSpecs: {
          list: [
            {
              name: 'agent-spec',
              preset: {
                endpoint: 'openAI',
                iconURL: 'https://example.com/preset-icon.png',
              },
            },
          ],
        },
      },
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGenerationJobManager.updateMetadata).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        iconURL: 'https://example.com/preset-icon.png',
        model: 'agent_resume_spec',
      }),
    );
  });

  it('falls back to the model spec preset endpoint when no icon URL is configured', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use the endpoint icon.',
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          spec: 'endpoint-icon-spec',
          model_parameters: { model: 'gpt-4.1' },
        },
      },
      config: {
        modelSpecs: {
          list: [
            {
              name: 'endpoint-icon-spec',
              preset: {
                endpoint: 'anthropic',
              },
            },
          ],
        },
      },
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGenerationJobManager.updateMetadata).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        iconURL: 'anthropic',
        model: 'gpt-4.1',
      }),
    );
  });

  it('filters OAuth prompts before saving partial responses on disconnect', async () => {
    const conversationId = 'conversation-123';
    let allSubscribersLeftHandler;
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: {
        on: jest.fn((event, handler) => {
          if (event === 'allSubscribersLeft') {
            allSubscribersLeftHandler = handler;
          }
        }),
      },
    });
    mockGenerationJobManager.getResumeState.mockResolvedValue({
      conversationId,
      responseMessageId: 'response-message',
      iconURL: 'https://example.com/spec-icon.png',
      model: 'gpt-4.1',
      userMessage: {
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        text: 'Use Google Workspace',
      },
    });

    const initializeClient = jest.fn().mockRejectedValue(new Error('stop after setup'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use Google Workspace',
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          iconURL: 'https://example.com/fallback-icon.png',
          modelOptions: { model: 'gpt-3.5-turbo' },
        },
      },
      config: {},
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);
    expect(allSubscribersLeftHandler).toEqual(expect.any(Function));

    const oauthPart = {
      type: 'tool_call',
      tool_call: {
        name: 'oauth_mcp_Google-Workspace',
        auth: 'https://auth.example.com/oauth',
      },
    };
    const textPart = { type: 'text', text: 'Partial response...' };

    await allSubscribersLeftHandler([oauthPart, textPart]);

    expect(mockFilterPersistableAbortContent).toHaveBeenCalledWith([oauthPart, textPart]);
    expect(mockSaveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123' }),
      expect.objectContaining({
        content: [textPart],
        iconURL: 'https://example.com/spec-icon.png',
        model: 'gpt-4.1',
        messageId: 'response-message',
        parentMessageId: 'user-message',
      }),
      expect.any(Object),
    );
  });

  it('uses model spec and agent fallbacks when saving partial responses on disconnect', async () => {
    const conversationId = 'conversation-123';
    let allSubscribersLeftHandler;
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: {
        on: jest.fn((event, handler) => {
          if (event === 'allSubscribersLeft') {
            allSubscribersLeftHandler = handler;
          }
        }),
      },
    });
    mockGenerationJobManager.getResumeState.mockResolvedValue({
      conversationId,
      responseMessageId: 'response-message',
      userMessage: {
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        text: 'Use fallback metadata',
      },
    });

    const initializeClient = jest.fn().mockRejectedValue(new Error('stop after setup'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use fallback metadata',
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          spec: 'agent-spec',
          agent_id: 'agent_resume_spec',
          model_parameters: { model: 'gpt-4.1' },
        },
      },
      config: {
        modelSpecs: {
          list: [
            {
              name: 'agent-spec',
              preset: {
                endpoint: 'openAI',
                iconURL: 'https://example.com/preset-icon.png',
              },
            },
          ],
        },
      },
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);
    expect(allSubscribersLeftHandler).toEqual(expect.any(Function));

    const textPart = { type: 'text', text: 'Partial response...' };
    await allSubscribersLeftHandler([textPart]);

    expect(mockSaveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123' }),
      expect.objectContaining({
        content: [textPart],
        iconURL: 'https://example.com/preset-icon.png',
        model: 'agent_resume_spec',
        messageId: 'response-message',
        parentMessageId: 'user-message',
      }),
      expect.any(Object),
    );
  });
});
