jest.mock('@librechat/data-schemas', () => ({
  hashToken: jest.fn(async (value) => `hashed:${value}`),
  logger: { error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  getInvite: jest.fn(),
  normalizeLifeInviteCode: jest.fn((value) => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^YW[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(normalized) ? normalized : null;
  }),
}));

jest.mock('~/models', () => ({
  createToken: jest.fn(),
  findToken: jest.fn(),
  deleteTokens: jest.fn(),
  reserveLifeInvitation: jest.fn(),
}));

const { logger } = require('@librechat/data-schemas');
const { reserveLifeInvitation } = require('~/models');
const checkInviteUser = require('./checkInviteUser');

const response = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('rejects a malformed invite code before a database lookup', async () => {
  const req = { body: { inviteCode: 'not-an-invite' } };
  const res = response();
  const next = jest.fn();

  await checkInviteUser(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(reserveLifeInvitation).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

test('reserves a valid invite code and passes the reservation to registration', async () => {
  const invitation = { _id: 'invitation-1', inviterUserId: 'user-1' };
  reserveLifeInvitation.mockResolvedValue(invitation);
  const req = { body: { inviteCode: 'yw-7k9p-2m8q' } };
  const res = response();
  const next = jest.fn();

  await checkInviteUser(req, res, next);

  expect(reserveLifeInvitation).toHaveBeenCalledWith(
    expect.objectContaining({
      codeHash: 'hashed:YW7K9P2M8Q',
      reservationId: expect.any(String),
      reservationExpiresAt: expect.any(Date),
    }),
  );
  expect(req.lifeInvitation).toEqual({
    invitation,
    reservationId: expect.any(String),
  });
  expect(req.invite).toBe(invitation);
  expect(next).toHaveBeenCalledTimes(1);
});

test('rejects an invite code that is expired, used, or already reserved', async () => {
  reserveLifeInvitation.mockResolvedValue(null);
  const req = { body: { inviteCode: 'YW-7K9P-2M8Q' } };
  const res = response();
  const next = jest.fn();

  await checkInviteUser(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ message: '邀请码无效、已使用或已过期' });
  expect(next).not.toHaveBeenCalled();
});

test('fails closed without leaking a database error', async () => {
  reserveLifeInvitation.mockRejectedValue(new Error('database hostname'));
  const req = { body: { inviteCode: 'YW-7K9P-2M8Q' } };
  const res = response();
  const next = jest.fn();

  await checkInviteUser(req, res, next);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ message: '邀请码暂时无法验证，请稍后再试' });
  expect(logger.error).toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});
