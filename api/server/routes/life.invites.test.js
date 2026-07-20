const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

jest.mock('@librechat/api', () => ({
  createLifeEngineClient: jest.fn(() => ({ json: jest.fn(), fetchResponse: jest.fn() })),
  LifeEngineError: class LifeEngineError extends Error {},
  formatLifeInviteCode: jest.fn(() => 'YW-7K9P-2M8Q'),
  generateLifeInviteCode: jest.fn(() => 'YW7K9P2M8Q'),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
  hashToken: jest.fn(async (value) => `hashed:${value}`),
}));

jest.mock('~/server/middleware/roles/admin', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/limiters', () => ({
  lifeShareLimiter: (_req, _res, next) => next(),
}));
jest.mock('~/server/middleware/optionalJwtAuth', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (req, _res, next) => {
  req.user = req.user || { id: '507f1f77bcf86cd799439011' };
  next();
});

jest.mock('~/server/services/lifeOperations', () => ({
  runLifeOperation: jest.fn(),
  LifeOperationPendingError: class LifeOperationPendingError extends Error {},
  LifeOperationConflictError: class LifeOperationConflictError extends Error {},
}));

jest.mock('~/models', () => ({
  createLifeInvitation: jest.fn(),
}));

const { createLifeInvitation } = require('~/models');
const lifeRouter = require('./life');

const chain = (value) => ({
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      lean: jest.fn(async () => value),
    })),
  })),
});

const userChain = (value) => ({
  select: jest.fn(() => ({ lean: jest.fn(async () => value) })),
});

const tokenChain = (value) => ({
  select: jest.fn(() => chain(value)),
});

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = { id: '507f1f77bcf86cd799439011' };
  next();
});
app.use(lifeRouter);

beforeEach(() => {
  jest.clearAllMocks();
  delete mongoose.models.LifeInvitation;
  delete mongoose.models.Token;
  delete mongoose.models.User;
  delete mongoose.models.Conversation;
});

afterAll(() => {
  delete mongoose.models.LifeInvitation;
  delete mongoose.models.Token;
  delete mongoose.models.User;
  delete mongoose.models.Conversation;
});

test('creates a durable invite owned by the current admin', async () => {
  createLifeInvitation.mockResolvedValue({ _id: 'invitation-id' });

  const response = await request(app).post('/admin/invites').send({});

  expect(response.status).toBe(201);
  expect(response.body).toEqual({
    code: 'YW-7K9P-2M8Q',
    url: 'http://localhost:3080/home#invite=YW-7K9P-2M8Q',
  });
  expect(createLifeInvitation).toHaveBeenCalledWith(
    expect.objectContaining({
      codeHash: 'hashed:YW7K9P2M8Q',
      codeHint: '2M8Q',
      inviterUserId: '507f1f77bcf86cd799439011',
      expiresAt: expect.any(Date),
    }),
  );
});

test('maps invitation ownership, acceptance, and conversation activity for the admin list', async () => {
  const inviterId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const acceptedId = new mongoose.Types.ObjectId('507f191e810c19729de860ea');
  const acceptedAt = new Date('2026-07-20T08:00:00.000Z');
  mongoose.models.LifeInvitation = {
    find: jest.fn(() =>
      chain([
        {
          _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
          codeHint: '2M8Q',
          inviterUserId: inviterId,
          status: 'accepted',
          acceptedByUserId: acceptedId,
          acceptedAt,
          createdAt: new Date('2026-07-20T07:00:00.000Z'),
          expiresAt: new Date('2026-07-27T07:00:00.000Z'),
        },
      ]),
    ),
  };
  mongoose.models.Token = { find: jest.fn(() => tokenChain([])) };
  mongoose.models.User = {
    find: jest.fn(() =>
      userChain([
        { _id: inviterId, name: '邀请人', email: 'owner@example.com' },
        { _id: acceptedId, name: '新用户', email: 'friend@example.com' },
      ]),
    ),
  };
  mongoose.models.Conversation = {
    aggregate: jest.fn(async () => [
      {
        _id: String(acceptedId),
        conversations: 2,
        lastActive: new Date('2026-07-20T09:00:00.000Z'),
      },
    ]),
  };

  const response = await request(app).get('/admin/invites');

  expect(response.status).toBe(200);
  expect(response.body.invites[0]).toEqual(
    expect.objectContaining({
      codeHint: '2M8Q',
      status: 'activated',
      inviter: expect.objectContaining({ name: '邀请人' }),
      acceptedBy: expect.objectContaining({ name: '新用户' }),
      conversationCount: 2,
      acceptedAt: acceptedAt.toISOString(),
    }),
  );
  expect(mongoose.models.Conversation.aggregate).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          user: { $in: expect.any(Array) },
          spec: 'future-lines',
          isTemporary: { $ne: true },
          'messages.0': { $exists: true },
        }),
      }),
    ]),
  );
});
