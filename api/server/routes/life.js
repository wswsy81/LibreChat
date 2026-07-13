const express = require('express');
const mongoose = require('mongoose');
const { createHmac, randomUUID } = require('crypto');
const { createLifeEngineClient, LifeEngineError } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { lifeShareLimiter } = require('~/server/middleware/limiters');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { runLifeOperation, LifeOperationPendingError } = require('~/server/services/lifeOperations');

const router = express.Router();
const engine = createLifeEngineClient({
  baseUrl: process.env.FUTURE_ENGINE_URL || 'http://future-engine:8899',
  token: process.env.FUTURE_ENGINE_INTERNAL_TOKEN || 'future-lines-local-internal',
});

const noStore = (_req, res, next) => {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Authorization, Cookie',
  });
  next();
};

const userId = (req) => String(req.user?.id || req.user?._id || '');

async function latestLifeConversation(id) {
  if (!id) return null;
  const Conversation = mongoose.models.Conversation;
  if (!Conversation) return null;
  return Conversation.findOne({
    user: id,
    spec: 'future-lines',
    isTemporary: { $ne: true },
    'messages.0': { $exists: true },
    $or: [
      { expiredAt: { $exists: false } },
      { expiredAt: null },
      { expiredAt: { $gt: new Date() } },
    ],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .select({ _id: 0, conversationId: 1, title: 1, updatedAt: 1 })
    .lean();
}

const RESUME_REPLAY_WINDOW_MS = 10 * 60 * 1000;
const SHARE_TOKEN_SECRET =
  process.env.LIFE_SHARE_TOKEN_SECRET ||
  process.env.JWT_SECRET ||
  process.env.FUTURE_ENGINE_INTERNAL_TOKEN ||
  'future-lines-local-internal';

function idempotencyKeyOf(req, res) {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!key || key.length > 128) {
    res.status(400).json({
      error: { code: 'MISSING_IDEMPOTENCY_KEY', message: '缺少有效的 Idempotency-Key 请求头' },
    });
    return null;
  }
  return key;
}

function shareTokenFor({ id, reportId, idempotencyKey }) {
  return createHmac('sha256', SHARE_TOKEN_SECRET)
    .update(JSON.stringify([id, reportId, idempotencyKey]))
    .digest('base64url');
}

function engineError(res, error) {
  if (error instanceof LifeOperationPendingError) {
    return res.status(409).json({
      error: {
        code: 'LIFE_OPERATION_PENDING',
        message: '操作正在处理，请稍后重试',
        retryable: true,
      },
    });
  }
  if (error instanceof LifeEngineError) {
    return res.status(error.status).json(
      error.payload || {
        error: {
          code: 'LIFE_ENGINE_ERROR',
          message: error.message,
          retryable: error.status >= 500,
        },
      },
    );
  }
  logger.error('[life] request failed', error);
  return res.status(503).json({
    error: { code: 'LIFE_ENGINE_UNAVAILABLE', message: '人生存档暂时不可用', retryable: true },
  });
}

function onboardingPrompt(dashboards, birthOptIn) {
  const names = { health: '健康', work: '工作', play: '玩', love: '爱' };
  const entries = Object.keys(names).map((key) => ({
    key,
    name: names[key],
    value: Number(dashboards[key]),
  }));
  const lowest = entries.reduce(
    (best, item) => (item.value < best.value ? item : best),
    entries[0],
  );
  const bars = entries.map((item) => `${item.name} ${item.value}`).join('、');
  const snapshot = `我的人生血条(0-10)：${bars}。最低的是「${lowest.name}」。`;
  return birthOptIn
    ? `我想先给出生时间，拿角色卡和血条出厂设置（八字/星盘）。${snapshot}`
    : snapshot;
}

function chatRoute(prompt) {
  const params = new URLSearchParams({ q: prompt, submit: 'true' });
  return `/c/new?${params.toString()}`;
}

function safeDownloadName(value) {
  const printable = Array.from(String(value || '人生存档报告'))
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');
  const clean = printable
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean || '人生存档报告';
}

async function reportHtml(req, res, format, download = false) {
  try {
    const reportId = encodeURIComponent(req.params.id);
    const [html, metadata] = await Promise.all([
      engine.text(`/internal/reports/${reportId}/${format}`, { userId: userId(req) }),
      download
        ? engine.json(`/internal/reports/${reportId}`, { userId: userId(req) })
        : Promise.resolve(null),
    ]);
    res.type('html');
    res.set(
      'Content-Security-Policy',
      format === 'print'
        ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; base-uri 'none'; form-action 'none'"
        : "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    );
    if (download) {
      const title = metadata?.report?.title || '人生存档报告';
      res.attachment(`${safeDownloadName(title)}.html`);
    }
    return res.send(html);
  } catch (error) {
    return engineError(res, error);
  }
}

router.use(noStore);

router.get('/bootstrap', optionalJwtAuth, async (req, res) => {
  const id = userId(req);
  if (!id) {
    return res.json({
      authenticated: false,
      user: null,
      profileState: 'empty',
      hasSubstantiveProfile: false,
      recommendedRoute: '/home',
    });
  }
  try {
    const [bootstrap, conversation] = await Promise.all([
      engine.json('/internal/bootstrap', { userId: id }),
      latestLifeConversation(id),
    ]);
    const hasProfile = bootstrap.hasSubstantiveProfile === true;
    return res.json({
      authenticated: true,
      user: { id, name: req.user.name || '朋友', email: req.user.email || null },
      ...bootstrap,
      lastConversationId: conversation?.conversationId || null,
      lastConversationTitle: conversation?.title || null,
      recommendedRoute: hasProfile ? '/resume' : '/home',
    });
  } catch (error) {
    logger.error('[life] bootstrap failed', error);
    return res.status(200).json({
      authenticated: true,
      user: { id, name: req.user.name || '朋友', email: req.user.email || null },
      profileState: 'unavailable',
      hasSubstantiveProfile: null,
      recommendedRoute: '/home',
      error: { code: 'PROFILE_UNAVAILABLE', message: '人生存档暂时读取失败', retryable: true },
    });
  }
});

router.get('/shares/:token', lifeShareLimiter, async (req, res) => {
  try {
    const result = await engine.json(`/internal/shares/${encodeURIComponent(req.params.token)}`);
    res.set('Cache-Control', 'no-store, max-age=0');
    return res.json(result);
  } catch (error) {
    return engineError(res, error);
  }
});

router.use(requireJwtAuth);

router.post('/onboarding', async (req, res) => {
  const dashboards = req.body?.dashboards || {};
  const valid = ['health', 'work', 'play', 'love'].every(
    (key) => Number.isInteger(dashboards[key]) && dashboards[key] >= 0 && dashboards[key] <= 10,
  );
  if (!valid) {
    return res
      .status(422)
      .json({ error: { code: 'INVALID_DASHBOARDS', message: '四条血条都需要 0–10 的整数' } });
  }
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  try {
    const outcome = await runLifeOperation({
      userId: userId(req),
      operation: 'onboarding',
      idempotencyKey: key,
      replayWindowMs: RESUME_REPLAY_WINDOW_MS,
      executor: async () => {
        const result = await engine.json('/internal/onboarding', {
          userId: userId(req),
          method: 'POST',
          body: {
            archiveName: String(req.body?.archiveName || req.user.name || '朋友').slice(0, 40),
            dashboards,
          },
        });
        const prompt = onboardingPrompt(dashboards, req.body?.birthOptIn === true);
        return { ...result, prompt, route: chatRoute(prompt), operationId: randomUUID() };
      },
    });
    return res.json(outcome);
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/diagnostics/blood-bars', async (req, res) => {
  const dashboards = req.body?.dashboards || {};
  const valid = ['health', 'work', 'play', 'love'].every(
    (key) => Number.isInteger(dashboards[key]) && dashboards[key] >= 0 && dashboards[key] <= 10,
  );
  if (!valid) {
    return res
      .status(422)
      .json({ error: { code: 'INVALID_DASHBOARDS', message: '四条血条都需要 0–10 的整数' } });
  }
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  try {
    const outcome = await runLifeOperation({
      userId: userId(req),
      operation: 'blood-bars',
      idempotencyKey: key,
      executor: () =>
        engine.json('/internal/diagnostics/blood-bars', {
          userId: userId(req),
          method: 'POST',
          body: { dashboards },
        }),
    });
    return res.json(outcome);
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/resume', async (req, res) => {
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  try {
    const id = userId(req);
    const conversation = await latestLifeConversation(id);
    if (conversation?.conversationId) {
      return res.json({
        action: 'restored',
        conversationId: conversation.conversationId,
        route: `/c/${conversation.conversationId}`,
      });
    }
    const outcome = await runLifeOperation({
      userId: id,
      operation: 'resume-create',
      idempotencyKey: key,
      replayWindowMs: RESUME_REPLAY_WINDOW_MS,
      persistIf: (result) => result.action === 'new',
      executor: async () => {
        const recheck = await latestLifeConversation(id);
        if (recheck?.conversationId) {
          return {
            action: 'restored',
            conversationId: recheck.conversationId,
            route: `/c/${recheck.conversationId}`,
          };
        }
        const prompt =
          '我回来了。先读回我的人生存档，看看上次聊到哪、这段时间哪些变了，从那儿接着聊。';
        return {
          action: 'new',
          conversationId: null,
          route: chatRoute(prompt),
          operationId: randomUUID(),
        };
      },
    });
    return res.json(outcome);
  } catch (error) {
    return engineError(res, error);
  }
});

router.get('/archive', async (req, res) => {
  try {
    return res.json(await engine.json('/internal/archive', { userId: userId(req) }));
  } catch (error) {
    return engineError(res, error);
  }
});

router.get('/reports', async (req, res) => {
  try {
    return res.json(await engine.json('/internal/reports', { userId: userId(req) }));
  } catch (error) {
    return engineError(res, error);
  }
});

router.get('/reports/:id', async (req, res) => {
  try {
    return res.json(
      await engine.json(`/internal/reports/${encodeURIComponent(req.params.id)}`, {
        userId: userId(req),
      }),
    );
  } catch (error) {
    return engineError(res, error);
  }
});

router.get('/reports/:id/html', (req, res) => reportHtml(req, res, 'html'));
router.get('/reports/:id/print', (req, res) => reportHtml(req, res, 'print'));
router.get('/reports/:id/export.html', (req, res) => reportHtml(req, res, 'html', true));
router.get('/reports/:id/print.html', (req, res) => reportHtml(req, res, 'print'));

router.post('/reports/:id/shares', async (req, res) => {
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  try {
    const id = userId(req);
    const reportId = String(req.params.id);
    const result = await engine.json(`/internal/reports/${encodeURIComponent(reportId)}/shares`, {
      userId: id,
      method: 'POST',
      body: {
        expiresAt: req.body?.expiresAt || null,
        token: shareTokenFor({ id, reportId, idempotencyKey: key }),
      },
    });
    return res.status(201).json({
      shareId: result.shareId,
      expiresAt: result.expiresAt,
      shareUrl: `/s/archive/${encodeURIComponent(result.token)}`,
    });
  } catch (error) {
    return engineError(res, error);
  }
});

router.delete('/reports/:id/shares/:shareId', async (req, res) => {
  try {
    return res.json(
      await engine.json(
        `/internal/reports/${encodeURIComponent(req.params.id)}/shares/${encodeURIComponent(req.params.shareId)}`,
        { userId: userId(req), method: 'DELETE' },
      ),
    );
  } catch (error) {
    return engineError(res, error);
  }
});

module.exports = router;
