const { EventEmitter } = require('events');
const accountDeletionFence = require('./accountDeletionFence');

function response() {
  const res = new EventEmitter();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('accountDeletionFence', () => {
  beforeEach(() => accountDeletionFence.resetForTests());

  it('blocks authenticated mutations after account deletion begins', () => {
    const req = {
      method: 'POST',
      baseUrl: '/api/messages',
      path: '/',
      user: { id: 'user-1', accountDeletionStartedAt: new Date() },
    };
    const res = response();
    const next = jest.fn();

    accountDeletionFence(req, res, next);

    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ACCOUNT_DELETION_IN_PROGRESS' }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows read-only requests and the account deletion retry endpoint', () => {
    for (const req of [
      {
        method: 'GET',
        baseUrl: '/api/user',
        path: '/',
        user: { accountDeletionStartedAt: new Date() },
      },
      {
        method: 'DELETE',
        baseUrl: '/api/user',
        path: '/delete',
        user: { accountDeletionStartedAt: new Date() },
      },
    ]) {
      const next = jest.fn();
      accountDeletionFence(req, response(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('blocks new writes and waits for already-authenticated mutations to drain', async () => {
    const activeResponse = response();
    const activeNext = jest.fn();
    accountDeletionFence(
      {
        method: 'POST',
        baseUrl: '/api/messages',
        path: '/',
        user: { id: 'user-1' },
      },
      activeResponse,
      activeNext,
    );
    expect(activeNext).toHaveBeenCalledTimes(1);

    let drained = false;
    const drain = accountDeletionFence.beginAccountDeletion('user-1').then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    const blockedResponse = response();
    accountDeletionFence(
      {
        method: 'POST',
        baseUrl: '/api/messages',
        path: '/',
        user: { id: 'user-1' },
      },
      blockedResponse,
      jest.fn(),
    );
    expect(blockedResponse.status).toHaveBeenCalledWith(423);

    activeResponse.emit('finish');
    await drain;
    expect(drained).toBe(true);
  });
});
