import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { IUser } from '@librechat/data-schemas';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import type { MCPConnection } from '~/mcp/connection';
import {
  FUTURE_ENGINE_IDENTITY_HEADER,
  FUTURE_ENGINE_IDENTITY_PLACEHOLDER,
} from '~/utils/identityAssertion';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTenantId: jest.fn(),
  tenantStorage: {
    getStore: jest.fn(),
    run: jest.fn((_context, fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  isOAuthUrlAllowed: jest.fn(() => false),
  isSSRFTarget: jest.fn(() => false),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: {
    CONNECTION_CHECK_TTL: 0,
    CB_CYCLE_WINDOW_MS: 60_000,
    CB_MAX_CYCLES: 10,
    CB_CYCLE_COOLDOWN_MS: 60_000,
    CB_FAILED_WINDOW_MS: 60_000,
    CB_MAX_FAILED_ROUNDS: 10,
    CB_BASE_BACKOFF_MS: 100,
    CB_MAX_BACKOFF_MS: 1_000,
  },
}));

type AssertionPayload = {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
};

type IdentityServer = {
  accepted: AssertionPayload[];
  url: string;
  close: () => Promise<void>;
};

function readAssertionPayload(value: string | string[] | undefined): AssertionPayload | null {
  const assertion = Array.isArray(value) ? value[0] : value;
  const encoded = assertion?.split('.')[1];
  if (!encoded) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AssertionPayload;
  } catch {
    return null;
  }
}

async function createIdentityServer(
  getNowMs: () => number,
  expectedUserId: string,
): Promise<IdentityServer> {
  const accepted: AssertionPayload[] = [];
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const sockets = new Set<Socket>();

  const server = http.createServer(async (req, res) => {
    const payload = readAssertionPayload(req.headers[FUTURE_ENGINE_IDENTITY_HEADER.toLowerCase()]);
    const nowSeconds = Math.floor(getNowMs() / 1000);
    if (!payload || payload.sub !== expectedUserId || payload.exp < nowSeconds) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'identity assertion expired' }));
      return;
    }
    accepted.push(payload);

    const sessionId = req.headers['mcp-session-id'];
    let transport = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
    if (!transport) {
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      const mcp = new McpServer({ name: 'future-engine-test', version: '1.0.0' });
      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);
    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, transport);
      transport.onclose = () => sessions.delete(transport!.sessionId!);
    }
  });

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    accepted,
    url: `http://127.0.0.1:${port}/mcp`,
    close: async () => {
      await Promise.all(
        [...sessions.values()].map((transport) => transport.close().catch(() => undefined)),
      );
      sessions.clear();
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function safeDisconnect(connection: MCPConnection | null): Promise<void> {
  if (!connection) {
    return;
  }
  (connection as unknown as { shouldStopReconnecting: boolean }).shouldStopReconnecting = true;
  connection.removeAllListeners();
  await connection.disconnect().catch(() => undefined);
}

describe('future-engine MCP identity assertion lifecycle', () => {
  const userId = 'identity-refresh-user';
  const secret = 'future-engine-refresh-test-secret-'.repeat(2);
  let nowMs = Date.parse('2026-07-18T00:00:00.000Z');
  let server: IdentityServer | null = null;
  let connection: MCPConnection | null = null;
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    process.env.FUTURE_ENGINE_IDENTITY_SECRET = secret;
    nowMs = Date.parse('2026-07-18T00:00:00.000Z');
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  });

  afterEach(async () => {
    await safeDisconnect(connection);
    connection = null;
    await server?.close();
    server = null;
    dateNowSpy.mockRestore();
    delete process.env.FUTURE_ENGINE_IDENTITY_SECRET;
    jest.clearAllMocks();
  });

  async function connect(): Promise<MCPConnection> {
    server = await createIdentityServer(() => nowMs, userId);
    return MCPConnectionFactory.create(
      {
        serverName: 'future-engine-identity-test',
        serverConfig: {
          type: 'streamable-http',
          url: server.url,
          requiresOAuth: false,
          headers: {
            [FUTURE_ENGINE_IDENTITY_HEADER]: FUTURE_ENGINE_IDENTITY_PLACEHOLDER,
          },
        },
        useSSRFProtection: false,
      },
      { user: { id: userId } as IUser },
    );
  }

  it('refreshes the assertion for a ping after the cached connection is older than 60 seconds', async () => {
    connection = await connect();
    const initialJtis = new Set(server!.accepted.map(({ jti }) => jti));
    const oauthErrors: unknown[] = [];
    connection.on('oauthError', (error) => oauthErrors.push(error));

    nowMs += 61_000;

    await expect(connection.isConnected()).resolves.toBe(true);
    expect(oauthErrors).toHaveLength(0);
    expect(server!.accepted.some(({ iat }) => iat >= Math.floor(nowMs / 1000))).toBe(true);
    expect(server!.accepted.some(({ jti }) => !initialJtis.has(jti))).toBe(true);
  });

  it('refreshes the assertion when rebuilding a transport after 60 seconds', async () => {
    connection = await connect();
    const initialJtis = new Set(server!.accepted.map(({ jti }) => jti));
    const oauthRequired = jest.fn();
    connection.on('oauthRequired', oauthRequired);

    nowMs += 61_000;
    (connection as unknown as { connectionState: string }).connectionState = 'disconnected';

    await expect(connection.connectClient()).resolves.toBeUndefined();
    await expect(connection.isConnected()).resolves.toBe(true);
    expect(oauthRequired).not.toHaveBeenCalled();
    expect(server!.accepted.some(({ iat }) => iat >= Math.floor(nowMs / 1000))).toBe(true);
    expect(server!.accepted.some(({ jti }) => !initialJtis.has(jti))).toBe(true);
  });
});
