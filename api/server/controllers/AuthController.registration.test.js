jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  math: jest.fn((_value, fallback) => fallback),
  isEnabled: jest.fn(),
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
