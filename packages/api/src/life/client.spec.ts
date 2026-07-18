import {
  createLifeEngineClient,
  deleteLifeAccountData,
  LifeAccountDeletionReceiptError,
} from './client';

describe('LifeEngineClient trusted identity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a signed short-lived user assertion and never forwards the raw user id', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createLifeEngineClient({
      baseUrl: 'http://future-engine:8899',
      token: 'internal-token',
      identitySecret: 'sec001-test-secret-'.repeat(4),
    });

    await client.json('/internal/bootstrap', { userId: 'life-user-123' });

    const request = fetchMock.mock.calls[0];
    const headers = request[1]?.headers as Record<string, string>;
    expect(headers['X-LibreChat-User-Id']).toBeUndefined();
    expect(headers['X-LibreChat-Identity']).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const payload = JSON.parse(
      Buffer.from(headers['X-LibreChat-Identity'].split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(payload).toMatchObject({
      v: 1,
      sub: 'life-user-123',
      aud: 'future-engine',
      scope: 'life-api',
    });
  });

  it('forwards the stable operation receipt identity on profile mutations', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createLifeEngineClient({
      baseUrl: 'http://future-engine:8899',
      token: 'internal-token',
      identitySecret: 'sec001-test-secret-'.repeat(4),
    });

    await client.json('/internal/basics', {
      userId: 'life-user-123',
      method: 'POST',
      body: { nickname: '修文' },
      operation: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'basics-save',
        requestHash: 'a'.repeat(64),
      },
    });

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers).toMatchObject({
      'X-Life-Operation-Id': '11111111-1111-4111-8111-111111111111',
      'X-Life-Operation': 'basics-save',
      'X-Life-Request-Hash': 'a'.repeat(64),
    });
  });

  it('deletes account data through the signed engine endpoint with stable operation identity', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          deletionId: 'del_123',
          status: 'completed',
          planned: {
            profile: { files: 3 },
            reports: { reports: 1, reportFiles: 1, shares: 1 },
            analysisRows: 1,
          },
          remaining: {
            profile: { files: 0 },
            reports: { reports: 0, reportFiles: 0, shares: 0 },
            analysisRows: 0,
          },
          completedAt: '2026-07-18T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    );

    await deleteLifeAccountData({
      userId: 'life-user-123',
      operationId: '77777777-7777-4777-8777-777777777777',
      requestHash: 'b'.repeat(64),
      baseUrl: 'http://future-engine:8899',
      token: 'internal-token',
      identitySecret: 'sec001-test-secret-'.repeat(4),
    });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('http://future-engine:8899/internal/account');
    expect(request?.method).toBe('DELETE');
    expect(request?.body).toBe(JSON.stringify({ schemaVersion: 1 }));
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer internal-token',
      'X-Life-Operation-Id': '77777777-7777-4777-8777-777777777777',
      'X-Life-Operation': 'account-delete',
      'X-Life-Request-Hash': 'b'.repeat(64),
    });
  });

  it.each([
    { status: 'prepared' },
    {
      schemaVersion: 1,
      deletionId: 'del_123',
      status: 'completed',
      planned: {
        profile: { files: 1 },
        reports: { reports: 0, reportFiles: 0, shares: 0 },
        analysisRows: 0,
      },
      remaining: {
        profile: { files: 1 },
        reports: { reports: 0, reportFiles: 0, shares: 0 },
        analysisRows: 0,
      },
      completedAt: '2026-07-18T00:00:00.000Z',
    },
  ])('rejects malformed or non-empty account deletion receipts', async (payload) => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(
      deleteLifeAccountData({
        userId: 'life-user-123',
        operationId: '77777777-7777-4777-8777-777777777777',
        requestHash: 'b'.repeat(64),
        baseUrl: 'http://future-engine:8899',
        token: 'internal-token',
        identitySecret: 'sec001-test-secret-'.repeat(4),
      }),
    ).rejects.toBeInstanceOf(LifeAccountDeletionReceiptError);
  });
});
