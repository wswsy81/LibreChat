const express = require('express');
const request = require('supertest');

const originalEnv = process.env;

function createApp() {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    LIFE_SHARE_IP_WINDOW: '3',
    LIFE_SHARE_IP_MAX: '2',
  };
  jest.doMock('@librechat/api', () => ({
    limiterCache: jest.fn(() => undefined),
    removePorts: (req) => req.ip,
  }));

  const lifeShareLimiter = require('./lifeShareLimiter');
  const app = express();
  app.set('trust proxy', 1);
  app.get('/share', lifeShareLimiter, (_req, res) => res.status(204).end());
  return app;
}

describe('lifeShareLimiter', () => {
  afterEach(() => {
    jest.dontMock('@librechat/api');
    process.env = originalEnv;
  });

  it('limits repeated public report reads by source IP', async () => {
    const app = createApp();

    await request(app).get('/share').set('X-Forwarded-For', '203.0.113.10').expect(204);
    await request(app).get('/share').set('X-Forwarded-For', '203.0.113.10').expect(204);

    const response = await request(app)
      .get('/share')
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(429);

    expect(response.body).toEqual({
      error: {
        code: 'SHARE_READ_RATE_LIMITED',
        message: '分享读取过于频繁，请 3 分钟后再试',
        retryable: true,
      },
    });
  });

  it('keeps independent budgets for different IPs', async () => {
    const app = createApp();

    await request(app).get('/share').set('X-Forwarded-For', '203.0.113.20').expect(204);
    await request(app).get('/share').set('X-Forwarded-For', '203.0.113.20').expect(204);
    const response = await request(app)
      .get('/share')
      .set('X-Forwarded-For', '203.0.113.21')
      .expect(204);

    expect(response.status).toBe(204);
  });
});
