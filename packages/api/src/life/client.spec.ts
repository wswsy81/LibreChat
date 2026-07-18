import { createLifeEngineClient } from './client';

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
});
