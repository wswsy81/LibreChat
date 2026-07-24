const mockEngineJson = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  math: jest.fn((_value, fallback) => fallback),
  isEnabled: jest.fn(),
  createLifeEngineClient: jest.fn(() => ({ json: mockEngineJson })),
  findOpenIDUser: jest.fn(),
  getOpenIdIssuer: jest.fn(),
  buildOpenIDRefreshParams: jest.fn(),
}));

jest.mock('~/server/services/AuthService', () => ({
  requestPasswordReset: jest.fn(),
  setOpenIDAuthTokens: jest.fn(),
  setCloudFrontAuthCookies: jest.fn(),
  resetPassword: jest.fn(),
  setAuthTokens: jest.fn(),
  registerUser: jest.fn(),
}));

jest.mock('~/models', () => ({
  deleteAllUserSessions: jest.fn(),
  finalizeLifeInvitation: jest.fn(),
  getUserById: jest.fn(),
  findSession: jest.fn(),
  releaseLifeInvitation: jest.fn(),
  updateUser: jest.fn(),
  findUser: jest.fn(),
}));

jest.mock('~/server/services/GraphTokenService', () => ({ getGraphApiToken: jest.fn() }));
jest.mock('~/strategies', () => ({ getOpenIdConfig: jest.fn(), getOpenIdEmail: jest.fn() }));

const { registerUser } = require('~/server/services/AuthService');
const { finalizeLifeInvitation, releaseLifeInvitation } = require('~/models');
const { registrationController } = require('./AuthController');

const response = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const reservation = {
  invitation: {
    _id: 'invitation-id',
    inviterUserId: 'inviter-user-id',
  },
  reservationId: 'reservation-id',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEngineJson.mockResolvedValue({ ok: true });
  finalizeLifeInvitation.mockResolvedValue({ _id: 'invitation-id', status: 'accepted' });
  releaseLifeInvitation.mockResolvedValue({ _id: 'invitation-id', status: 'pending' });
});

test('finalizes an invitation before returning registration success', async () => {
  registerUser.mockImplementation(async (_body, additionalData, onUserCreated) => {
    expect(additionalData).toEqual(
      expect.objectContaining({
        invitedByUserId: 'inviter-user-id',
        invitationId: 'invitation-id',
        invitationAcceptedAt: expect.any(Date),
      }),
    );
    const user = { _id: 'accepted-user-id' };
    await onUserCreated(user);
    return { status: 200, message: 'registered', user };
  });
  const req = { body: { email: 'friend@example.com' }, lifeInvitation: reservation };
  const res = response();

  await registrationController(req, res);

  expect(finalizeLifeInvitation).toHaveBeenCalledWith({
    invitationId: 'invitation-id',
    reservationId: 'reservation-id',
    acceptedByUserId: 'accepted-user-id',
  });
  expect(releaseLifeInvitation).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.send).toHaveBeenCalledWith({ message: 'registered' });
});

test('stores optional registration basics before accepting the invitation', async () => {
  registerUser.mockImplementation(async (body, _additionalData, onUserCreated) => {
    expect(body).toEqual(expect.objectContaining({ gender: '女', age: '30多岁', city: '厦门' }));
    const user = { _id: 'accepted-user-id' };
    await onUserCreated(user, { gender: '女', age: '30多岁', city: '厦门' });
    return { status: 200, message: 'registered', user };
  });
  const req = {
    body: {
      email: 'friend@example.com',
      inviteCode: 'YW-TEST-CODE',
      gender: '女',
      age: '30多岁',
      city: '厦门',
    },
    lifeInvitation: reservation,
  };
  const res = response();

  await registrationController(req, res);

  expect(mockEngineJson).toHaveBeenCalledWith('/internal/basics', {
    userId: 'accepted-user-id',
    method: 'POST',
    body: { age: '30多岁', city: '厦门', gender: '女' },
    operation: {
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      name: 'basics-save',
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  });
  expect(mockEngineJson.mock.invocationCallOrder[0]).toBeLessThan(
    finalizeLifeInvitation.mock.invocationCallOrder[0],
  );
  expect(res.status).toHaveBeenCalledWith(200);
});

test('does not call future-engine when all optional basics are blank', async () => {
  registerUser.mockResolvedValue({
    status: 200,
    message: 'registered',
    user: { _id: 'plain-user-id' },
  });
  const req = {
    body: { email: 'plain@example.com', gender: '', age: '   ', city: '' },
  };
  const res = response();

  await registrationController(req, res);

  expect(registerUser.mock.calls[0][2]).toBeUndefined();
  expect(mockEngineJson).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
});

test('cleans stored basics when invitation finalization fails', async () => {
  finalizeLifeInvitation.mockResolvedValue(null);
  registerUser.mockImplementation(async (_body, _additionalData, onUserCreated) => {
    try {
      await onUserCreated(
        { _id: 'rollback-user-id' },
        { gender: '女', age: '30多岁', city: '厦门' },
      );
    } catch {
      return { status: 500, message: 'Something went wrong' };
    }
    throw new Error('expected callback failure');
  });
  const req = {
    body: { email: 'rollback@example.com', gender: '女', age: '30多岁', city: '厦门' },
    lifeInvitation: reservation,
  };
  const res = response();

  await registrationController(req, res);

  expect(mockEngineJson).toHaveBeenNthCalledWith(
    2,
    '/internal/account',
    expect.objectContaining({
      userId: 'rollback-user-id',
      method: 'DELETE',
      operation: expect.objectContaining({
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        name: 'account-delete',
      }),
    }),
  );
  expect(releaseLifeInvitation).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(500);
});

test('releases the reservation when registration does not create a user', async () => {
  registerUser.mockResolvedValue({ status: 200, message: 'generic response' });
  const req = { body: { email: 'existing@example.com' }, lifeInvitation: reservation };
  const res = response();

  await registrationController(req, res);

  expect(finalizeLifeInvitation).not.toHaveBeenCalled();
  expect(releaseLifeInvitation).toHaveBeenCalledWith({
    invitationId: 'invitation-id',
    reservationId: 'reservation-id',
  });
  expect(res.send).toHaveBeenCalledWith({ message: 'generic response' });
});
