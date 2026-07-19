const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const mockEngine = { json: jest.fn(), text: jest.fn() };

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createLifeEngineClient: jest.fn(() => mockEngine),
  LifeEngineError: class LifeEngineError extends Error {},
}));
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn() },
}));
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    models: {
      ...actual.models,
      Conversation: {
        findOne: jest.fn(() => ({
          sort: jest.fn(() => ({
            select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
          })),
        })),
      },
    },
  };
});
jest.mock('~/server/middleware/limiters', () => ({
  lifeShareLimiter: (_req, _res, next) => next(),
}));
jest.mock('~/server/services/lifeOperations', () => ({
  runLifeOperation: jest.fn(),
  LifeOperationPendingError: class LifeOperationPendingError extends Error {},
  LifeOperationConflictError: class LifeOperationConflictError extends Error {},
}));
jest.mock('~/server/middleware/optionalJwtAuth', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (_req, _res, next) => next());

const lifeRouter = require('./life');

function buildApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', name: '张东' };
    next();
  });
  app.use('/api/life', lifeRouter);
  return app;
}

// Regression: SEC-004 — product pages and HTML artifacts lacked anti-embedding policies
// Found by /qa on 2026-07-19
// Report: 报告/2026-07-19-yiweilife-B5生产验收.md
test('HTML artifacts allow only same-origin frames while the product shell denies framing', async () => {
  mockEngine.text.mockResolvedValue('<html><body>人生制品</body></html>');

  const [report, map, dossier] = await Promise.all([
    request(buildApp()).get('/api/life/reports/report-1/html'),
    request(buildApp()).get('/api/life/map/html'),
    request(buildApp()).get('/api/life/dossier/html'),
  ]);

  for (const response of [report, map, dossier]) {
    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  }

  const caddyfile = fs.readFileSync(path.resolve(__dirname, '../../../deploy/Caddyfile'), 'utf8');
  expect(caddyfile).toContain('@embeddedLifeHtml');
  expect(caddyfile).toContain('@productSurface');
  expect(caddyfile).toContain("frame-ancestors 'none'");
  expect(caddyfile).toContain('X-Frame-Options "DENY"');
  expect(caddyfile).toContain('X-Frame-Options "SAMEORIGIN"');
});
