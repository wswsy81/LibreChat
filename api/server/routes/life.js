const express = require('express');
const mongoose = require('mongoose');
const { createHmac } = require('crypto');
const path = require('path');
const {
  applyRulesConfig,
  applyRuntimeConfig,
  createLifeEngineClient,
  listRulesBackups,
  restoreRulesBackup,
  LifeEngineError,
  formatLifeInviteCode,
  generateLifeInviteCode,
  readRedactedPolicyBundle,
  runtimeApiPolicy,
  runtimeSecurityContracts,
} = require('@librechat/api');
const { logger, hashToken } = require('@librechat/data-schemas');
const checkAdmin = require('~/server/middleware/roles/admin');
const { lifeShareLimiter } = require('~/server/middleware/limiters');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const {
  runLifeOperation,
  LifeOperationPendingError,
  LifeOperationConflictError,
} = require('~/server/services/lifeOperations');
const { createLifeInvitation, redactExpiredLifeInvitationPlaintexts } = require('~/models');

const router = express.Router();
const engine = createLifeEngineClient({
  baseUrl: process.env.FUTURE_ENGINE_URL || 'http://future-engine:8899',
  token: process.env.FUTURE_ENGINE_INTERNAL_TOKEN || 'future-lines-local-internal',
  identitySecret: process.env.FUTURE_ENGINE_IDENTITY_SECRET || '',
});
const runtimeConfigDir = process.env.RUNTIME_CONFIG_DIR || path.resolve('/app/runtime-config');

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
  const candidates = await Conversation.find({
    user: id,
    spec: 'future-lines',
    isTemporary: { $ne: true },
    // A complete opening can legitimately be exactly root + assistant.
    // Fetch those candidates, then inspect the assistant message instead of
    // using a third-message proxy that creates a second root conversation.
    'messages.1': { $exists: true },
    $or: [
      { expiredAt: { $exists: false } },
      { expiredAt: null },
      { expiredAt: { $gt: new Date() } },
    ],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .select({ _id: 0, conversationId: 1, title: 1, updatedAt: 1, messages: 1 })
    .limit(20)
    .lean();

  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates[0]?.messages?.length >= 3) return candidates[0];

  const Message = mongoose.models.Message;
  const assistantMessageIds = candidates
    .filter((conversation) => conversation?.messages?.length === 2)
    .map((conversation) => conversation.messages[1])
    .filter(Boolean);
  const messages =
    Message && assistantMessageIds.length
      ? await Message.find({ _id: { $in: assistantMessageIds } })
          .select({ _id: 1, isCreatedByUser: 1, error: 1, unfinished: 1, text: 1, content: 1 })
          .lean()
      : [];
  const messageById = new Map(messages.map((message) => [String(message._id), message]));
  const hasContent = (message) => {
    if (typeof message?.text === 'string' && message.text.trim()) return true;
    return (
      Array.isArray(message?.content) &&
      message.content.some((part) => {
        if (part?.type === 'text')
          return typeof part.text === 'string' && Boolean(part.text.trim());
        if (part?.type !== 'resource' || !part.resource || typeof part.resource !== 'object') {
          return false;
        }
        return Object.values(part.resource).some((value) =>
          typeof value === 'string' ? Boolean(value.trim()) : value != null,
        );
      })
    );
  };
  const isCompleteAssistant = (message) =>
    message &&
    message.isCreatedByUser !== true &&
    !message.error &&
    message.unfinished !== true &&
    hasContent(message);

  for (const conversation of candidates) {
    if (conversation?.messages?.length >= 3) return conversation;
    if (conversation?.messages?.length !== 2) continue;
    const assistant = messageById.get(String(conversation.messages[1]));
    if (isCompleteAssistant(assistant)) return conversation;
  }
  return null;
}

function currentLanternHouse(bootstrap) {
  const house = bootstrap?.summary?.lifeWheel?.lanternHouse;
  return lifeHouseIds().has(house) ? house : null;
}

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

const STANCE_FEEDBACK_FIELDS = [
  'reportVersion',
  'selection',
  'effectiveLevel',
  'stancePolicyVersion',
];
const PRODUCT_PREVIEW_FIELDS = ['sourceProductId', 'fixtureId', 'targetProductIds'];
const PRODUCT_PREVIEW_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const PRODUCT_OBSERVABILITY_QUERY_FIELDS = ['windowDays', 'experimentId'];
const PRODUCT_OBSERVABILITY_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const PRODUCT_OBSERVABILITY_MAX_WINDOW_DAYS = 90;

function productPreviewBodyOf(req, res) {
  const raw = req.body;
  const isObject = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
  const targetProductIds =
    isObject && Array.isArray(raw.targetProductIds) ? raw.targetProductIds : [];
  const invalid =
    !isObject ||
    Object.keys(raw).some((field) => !PRODUCT_PREVIEW_FIELDS.includes(field)) ||
    Object.keys(raw).length !== PRODUCT_PREVIEW_FIELDS.length ||
    typeof raw.sourceProductId !== 'string' ||
    !PRODUCT_PREVIEW_ID_PATTERN.test(raw.sourceProductId) ||
    typeof raw.fixtureId !== 'string' ||
    !PRODUCT_PREVIEW_ID_PATTERN.test(raw.fixtureId) ||
    targetProductIds.length < 1 ||
    targetProductIds.length > 4 ||
    targetProductIds.some(
      (productId) => typeof productId !== 'string' || !PRODUCT_PREVIEW_ID_PATTERN.test(productId),
    ) ||
    new Set(targetProductIds).size !== targetProductIds.length;
  if (invalid) {
    res.status(422).json({
      error: {
        code: 'PRODUCT_PREVIEW_REQUEST_INVALID',
        message: '产品包预览请求无效',
        retryable: false,
      },
    });
    return null;
  }
  return {
    sourceProductId: raw.sourceProductId,
    fixtureId: raw.fixtureId,
    targetProductIds,
  };
}

/**
 * 只做类型边界:窗口是 1-90 的整数天,实验 ID 走与 engine 相同的白名单,
 * 且只允许这两个查询字段。真相与聚合在 future-engine,这里不放行任意查询。
 */
function observabilityQueryOf(req, res) {
  const raw = req.query || {};
  const rawWindowDays = raw.windowDays;
  const rawExperimentId = raw.experimentId;
  const windowDays = rawWindowDays === undefined ? 30 : Number(rawWindowDays);
  const invalid =
    Object.keys(raw).some((field) => !PRODUCT_OBSERVABILITY_QUERY_FIELDS.includes(field)) ||
    (rawWindowDays !== undefined &&
      (typeof rawWindowDays !== 'string' || !/^[0-9]{1,3}$/.test(rawWindowDays))) ||
    !Number.isInteger(windowDays) ||
    windowDays < 1 ||
    windowDays > PRODUCT_OBSERVABILITY_MAX_WINDOW_DAYS ||
    (rawExperimentId !== undefined &&
      (typeof rawExperimentId !== 'string' ||
        !PRODUCT_OBSERVABILITY_ID_PATTERN.test(rawExperimentId)));
  if (invalid) {
    res.status(422).json({
      error: {
        code: 'PRODUCT_OBSERVABILITY_QUERY_INVALID',
        message: '产品观测查询无效',
        retryable: false,
      },
    });
    return null;
  }
  return { windowDays, experimentId: rawExperimentId };
}

/**
 * 只做类型边界:枚举、整数版本、字段白名单与 engine 的
 * `assertStanceFeedbackBody` 逐条对齐。归属、报告版本与冻结力度的真相在 future-engine。
 * 返回的是 canonical 五字段(含 reportId),幂等 hash 与 engine body 必须用同一个对象——
 * 只 hash 公开四字段会让同一个 key 跨两份报告错误重放。
 */
function stanceFeedbackBodyOf(req, res, reportId) {
  const contracts = runtimeSecurityContracts();
  const stanceSelections = new Set(contracts.stanceSelections);
  const stanceLevels = new Set(contracts.stanceLevels);
  const stancePolicyVersionPattern = new RegExp(contracts.policyVersionPattern);
  const raw = req.body;
  const isObject = Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
  const invalid =
    !isObject ||
    Object.keys(raw).some((field) => !STANCE_FEEDBACK_FIELDS.includes(field)) ||
    !Number.isInteger(raw.reportVersion) ||
    raw.reportVersion < 1 ||
    !stanceSelections.has(raw.selection) ||
    !stanceLevels.has(raw.effectiveLevel) ||
    typeof raw.stancePolicyVersion !== 'string' ||
    !stancePolicyVersionPattern.test(raw.stancePolicyVersion);
  if (invalid) {
    res.status(422).json({
      error: { code: 'STANCE_FEEDBACK_INVALID', message: '这次反馈的内容无效', retryable: false },
    });
    return null;
  }
  return {
    reportId,
    reportVersion: raw.reportVersion,
    selection: raw.selection,
    effectiveLevel: raw.effectiveLevel,
    stancePolicyVersion: raw.stancePolicyVersion,
  };
}

function shareTokenFor({ id, reportId, idempotencyKey }) {
  return createHmac('sha256', SHARE_TOKEN_SECRET)
    .update(JSON.stringify([id, reportId, idempotencyKey]))
    .digest('base64url');
}

function engineError(res, error) {
  if (error instanceof LifeOperationConflictError || error?.code === 'LIFE_OPERATION_CONFLICT') {
    return res.status(409).json({
      error: {
        code: 'LIFE_OPERATION_CONFLICT',
        message: '同一个操作标识不能提交不同内容，请重新发起这次操作',
        retryable: false,
      },
    });
  }
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

function lifeHouseIds() {
  return new Set(runtimeSecurityContracts().houseIds);
}

function lifeVisitModes() {
  return new Set(runtimeSecurityContracts().lifeVisitModes);
}

function houseEntryPrompt(entryHouse, visitMode) {
  // system-tag(开场编排协议 §2):触发消息带 [trigger:*] 前缀,不伪装用户原话。
  // 前端渲染剥前缀显示;engine 证据层与提示词按前缀排除,不得引用为用户说过的话。
  return `[trigger:house_entered] entryHouse=${entryHouse};visitMode=${visitMode}`;
}

function validEntryEvent(value, requestedHouse) {
  return (
    value &&
    value.kind === 'house_entered' &&
    value.entryHouse === requestedHouse &&
    lifeHouseIds().has(value.entryHouse) &&
    lifeVisitModes().has(value.visitMode) &&
    typeof value.at === 'string' &&
    Number.isFinite(Date.parse(value.at))
  );
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

function setEmbeddedHtmlHeaders(res, policy) {
  res.set('Content-Security-Policy', `${policy}; frame-ancestors 'self'`);
  res.set('X-Frame-Options', 'SAMEORIGIN');
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
    setEmbeddedHtmlHeaders(
      res,
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

/** 文案覆盖层(运营台可改的"广告位"):mongo 存 key→文案,前端启动拉一次盖掉内置值。 */
const lifeCopySchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    value: { type: String, required: true },
  },
  { timestamps: true },
);
const LifeCopy = mongoose.models.LifeCopy || mongoose.model('LifeCopy', lifeCopySchema);
const COPY_KEY_PATTERN = /^com_[a-z0-9_]{1,80}$/;

router.get('/copy', async (_req, res) => {
  try {
    const rows = await LifeCopy.find({}).select({ _id: 0, key: 1, value: 1 }).lean();
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({
      overrides: Object.fromEntries(rows.map((row) => [row.key, row.value])),
    });
  } catch (error) {
    logger.error('[life] copy overrides read failed', error);
    return res.json({ overrides: {} });
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
  const rawBody =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const extra = Object.keys(rawBody).filter(
    (field) => !['archiveName', 'entryHouse'].includes(field),
  );
  const entryHouse = String(rawBody.entryHouse || '').trim();
  if (extra.length || !lifeHouseIds().has(entryHouse)) {
    return res
      .status(422)
      .json({ error: { code: 'INVALID_ENTRY_HOUSE', message: '请选择一个有效的人生领域' } });
  }
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  const body = {
    archiveName: String(rawBody.archiveName || req.user.name || '朋友').slice(0, 40),
    entryHouse,
  };
  try {
    const id = userId(req);
    const [bootstrap, conversation] = await Promise.all([
      engine.json('/internal/bootstrap', { userId: id }).catch(() => null),
      latestLifeConversation(id),
    ]);
    if (conversation?.conversationId && currentLanternHouse(bootstrap) === entryHouse) {
      return res.json({
        ok: true,
        profileVersion: bootstrap.profileVersion || 'v1',
        applied: 0,
        action: 'restored',
        conversationId: conversation.conversationId,
        entryEvent: {
          kind: 'house_entered',
          entryHouse,
          visitMode: 'continue',
          at: new Date().toISOString(),
        },
        prompt: '',
        route: `/c/${conversation.conversationId}`,
        operationId: null,
      });
    }
    const outcome = await runLifeOperation({
      userId: id,
      operation: 'onboarding',
      idempotencyKey: key,
      requestPayload: body,
      replayWindowMs: runtimeApiPolicy().resumeReplayWindowMs,
      executor: async ({ operationId, requestHash }) => {
        const result = await engine.json('/internal/onboarding', {
          userId: id,
          method: 'POST',
          body,
          operation: { id: operationId, name: 'onboarding', requestHash },
        });
        if (!validEntryEvent(result?.entryEvent, entryHouse)) {
          throw new LifeEngineError(502, 'future-engine 返回无效 house_entered 事件', {
            error: {
              code: 'INVALID_ENTRY_EVENT',
              message: '人生领域入口暂时不可用',
              retryable: true,
            },
          });
        }
        const prompt = houseEntryPrompt(result.entryEvent.entryHouse, result.entryEvent.visitMode);
        return { ...result, prompt, route: chatRoute(prompt), operationId };
      },
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
      requestPayload: { action: 'resume-create' },
      replayWindowMs: runtimeApiPolicy().resumeReplayWindowMs,
      persistIf: (result) => result.action === 'new',
      executor: async ({ operationId }) => {
        const recheck = await latestLifeConversation(id);
        if (recheck?.conversationId) {
          return {
            action: 'restored',
            conversationId: recheck.conversationId,
            route: `/c/${recheck.conversationId}`,
          };
        }
        const prompt =
          '[trigger:session_resumed] 我回来了。先读回我的人生存档，看看上次聊到哪、这段时间哪些变了，从那儿接着聊。';
        return {
          action: 'new',
          conversationId: null,
          route: chatRoute(prompt),
          operationId,
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

router.get('/inbox', async (req, res) => {
  try {
    return res.json(await engine.json('/internal/inbox', { userId: userId(req) }));
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/inbox', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(422).json({ error: { code: 'INBOX_EMPTY', message: '随手记内容不能为空' } });
  }
  try {
    const result = await engine.json('/internal/inbox', {
      userId: userId(req),
      method: 'POST',
      body: { text },
    });
    return res.status(201).json(result);
  } catch (error) {
    return engineError(res, error);
  }
});

router.get('/dossier/html', async (req, res) => {
  try {
    const revision = req.query.revision === '1' ? '?revision=1' : '';
    const html = await engine.text(`/internal/dossier/html${revision}`, { userId: userId(req) });
    res.type('html');
    setEmbeddedHtmlHeaders(
      res,
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    );
    return res.send(html);
  } catch (error) {
    return engineError(res, error);
  }
});

router.get('/map/html', async (req, res) => {
  try {
    const view = req.query.view === 'full' ? '?view=full' : '';
    const html = await engine.text(`/internal/map/html${view}`, { userId: userId(req) });
    res.type('html');
    setEmbeddedHtmlHeaders(
      res,
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    );
    return res.send(html);
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/basics', async (req, res) => {
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  const allowed = ['nickname', 'gender', 'age', 'occupation', 'city', 'education', 'marital'];
  const body = {};
  for (const field of allowed) {
    const value = req.body?.[field];
    if (value !== undefined) body[field] = value === null ? null : String(value);
  }
  try {
    const result = await runLifeOperation({
      userId: userId(req),
      operation: 'basics-save',
      idempotencyKey: key,
      requestPayload: body,
      executor: ({ operationId, requestHash }) =>
        engine.json('/internal/basics', {
          userId: userId(req),
          method: 'POST',
          body,
          operation: { id: operationId, name: 'basics-save', requestHash },
        }),
    });
    return res.json(result);
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/birth', async (req, res) => {
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  const numeric = (value) =>
    value === undefined || value === null || value === '' ? undefined : Number(value);
  const body = {
    year: numeric(req.body?.year),
    month: numeric(req.body?.month),
    day: numeric(req.body?.day),
    hour: numeric(req.body?.hour),
    minute: numeric(req.body?.minute),
    calendar: req.body?.calendar ? String(req.body.calendar) : undefined,
    gender: req.body?.gender ? String(req.body.gender) : undefined,
    city: req.body?.city ? String(req.body.city) : undefined,
  };
  try {
    const result = await runLifeOperation({
      userId: userId(req),
      operation: 'birth-save',
      idempotencyKey: key,
      requestPayload: body,
      executor: ({ operationId, requestHash }) =>
        engine.json('/internal/birth', {
          userId: userId(req),
          method: 'POST',
          body,
          operation: { id: operationId, name: 'birth-save', requestHash },
        }),
    });
    return res.json(result);
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/map/houses/annotate', async (req, res) => {
  const houseKey = String(req.body?.houseKey || '');
  const action = String(req.body?.action || '');
  const text = req.body?.text === undefined ? undefined : String(req.body.text);
  if (!houseKey || !action) {
    return res
      .status(422)
      .json({ error: { code: 'MAP_ANNOTATE_INVALID', message: '批注参数不完整' } });
  }
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  try {
    const result = await runLifeOperation({
      userId: userId(req),
      operation: 'map-house-annotate',
      idempotencyKey: key,
      requestPayload: { houseKey, action, text },
      executor: ({ operationId, requestHash }) =>
        engine.json('/internal/map/houses/annotate', {
          userId: userId(req),
          method: 'POST',
          body: { houseKey, action, text },
          operation: { id: operationId, name: 'map-house-annotate', requestHash },
        }),
    });
    return res.json(result);
  } catch (error) {
    return engineError(res, error);
  }
});

router.post('/dossier/annotate', async (req, res) => {
  const section = String(req.body?.section || '');
  const entryId = String(req.body?.entryId || '');
  const action = String(req.body?.action || '');
  const text = req.body?.text === undefined ? undefined : String(req.body.text);
  if (!section || !entryId || !action) {
    return res.status(422).json({ error: { code: 'ANNOTATE_INVALID', message: '批注参数不完整' } });
  }
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  try {
    const result = await runLifeOperation({
      userId: userId(req),
      operation: 'dossier-annotate',
      idempotencyKey: key,
      requestPayload: { section, entryId, action, text },
      executor: ({ operationId, requestHash }) =>
        engine.json('/internal/dossier/annotate', {
          userId: userId(req),
          method: 'POST',
          body: { section, entryId, action, text },
          operation: { id: operationId, name: 'dossier-annotate', requestHash },
        }),
    });
    return res.json(result);
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

router.post('/reports/:id/stance-feedback', async (req, res) => {
  const key = idempotencyKeyOf(req, res);
  if (!key) {
    return;
  }
  const reportId = String(req.params.id);
  const body = stanceFeedbackBodyOf(req, res, reportId);
  if (!body) {
    return;
  }
  try {
    const result = await runLifeOperation({
      userId: userId(req),
      operation: 'reveal-stance-feedback',
      idempotencyKey: key,
      requestPayload: body,
      executor: ({ operationId, requestHash }) =>
        engine.json(`/internal/reports/${encodeURIComponent(reportId)}/stance-feedback`, {
          userId: userId(req),
          method: 'POST',
          body,
          operation: { id: operationId, name: 'reveal-stance-feedback', requestHash },
        }),
    });
    return res.json(result);
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

/** 运营台(仅 ADMIN):邀请/用户/文案/状态。刻意不提供读用户对话与存档的入口——「你的存档只属于你」。 */
const UNBOUND_INVITE_EMAIL = 'invite@future-lines.local';
const admin = express.Router();
router.use('/admin', checkAdmin, admin);

const byUserFilter = (id) => {
  const or = [{ user: id }];
  if (mongoose.Types.ObjectId.isValid(id)) {
    or.push({ user: new mongoose.Types.ObjectId(id) });
  }
  return { $or: or };
};

const byUserIdsFilter = (ids) => {
  const values = ids.reduce((result, id) => {
    result.push(String(id));
    if (mongoose.Types.ObjectId.isValid(id)) {
      result.push(new mongoose.Types.ObjectId(id));
    }
    return result;
  }, []);
  return { user: { $in: values } };
};

const inviteStatus = (row, stats, now) => {
  if (row.status === 'accepted') {
    return stats?.conversations > 0 ? 'activated' : 'registered';
  }
  if (row.status === 'revoked') {
    return 'revoked';
  }
  if (row.expiresAt && new Date(row.expiresAt) <= now) {
    return 'expired';
  }
  return 'pending';
};

admin.post('/invites', async (req, res) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  let code;
  let invitation;
  for (let attempt = 0; attempt < 5 && !invitation; attempt += 1) {
    code = generateLifeInviteCode();
    try {
      invitation = await createLifeInvitation({
        codeHash: await hashToken(code),
        codeHint: code.slice(-4),
        // 明文码仅供后台回显/补发(待使用状态);核销校验仍走 codeHash
        codePlain: code,
        inviterUserId: userId(req),
        expiresAt,
      });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
  if (!invitation || !code) {
    return res.status(500).json({ error: { code: 'INVITE_FAILED', message: '邀请创建失败' } });
  }
  const base = (process.env.DOMAIN_CLIENT || 'http://localhost:3080').replace(/\/+$/, '');
  const displayCode = formatLifeInviteCode(code);
  return res.status(201).json({
    code: displayCode,
    url: `${base}/home#invite=${encodeURIComponent(displayCode)}`,
  });
});

admin.get('/invites', async (_req, res) => {
  const Token = mongoose.models.Token;
  const LifeInvitation = mongoose.models.LifeInvitation;
  if (LifeInvitation) {
    // 明文只在“待使用且未过期”窗口内保留；已核销在 finalize 时立即清，
    // 过期码在管理列表读取前批量清，同时保留 hash/审计记录。
    await redactExpiredLifeInvitationPlaintexts();
  }
  const [rows, legacyRows] = await Promise.all([
    LifeInvitation
      ? LifeInvitation.find({}).sort({ createdAt: -1 }).limit(100).lean()
      : Promise.resolve([]),
    Token
      ? Token.find({ email: UNBOUND_INVITE_EMAIL })
          .select({ _id: 0, createdAt: 1, expiresAt: 1 })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean()
      : Promise.resolve([]),
  ]);
  const userIds = [
    ...rows.map((row) => row.inviterUserId),
    ...rows.map((row) => row.acceptedByUserId).filter(Boolean),
  ];
  const acceptedIds = rows.map((row) => row.acceptedByUserId).filter(Boolean);
  const [users, activity] = await Promise.all([
    userIds.length
      ? mongoose.models.User.find({ _id: { $in: userIds } })
          .select({ name: 1, email: 1 })
          .lean()
      : Promise.resolve([]),
    acceptedIds.length
      ? mongoose.models.Conversation.aggregate([
          {
            $match: {
              ...byUserIdsFilter(acceptedIds),
              spec: 'future-lines',
              isTemporary: { $ne: true },
              'messages.0': { $exists: true },
            },
          },
          {
            $group: {
              _id: '$user',
              conversations: { $sum: 1 },
              lastActive: { $max: '$updatedAt' },
            },
          },
        ])
      : Promise.resolve([]),
  ]);
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const byAcceptedUser = new Map(activity.map((row) => [String(row._id), row]));
  const now = new Date();
  const linkBase = (process.env.DOMAIN_CLIENT || 'http://localhost:3080').replace(/\/+$/, '');
  const durableInvites = rows.map((row) => {
    const inviter = byId.get(String(row.inviterUserId));
    const acceptedUser = row.acceptedByUserId ? byId.get(String(row.acceptedByUserId)) : undefined;
    const stats = row.acceptedByUserId
      ? byAcceptedUser.get(String(row.acceptedByUserId))
      : undefined;
    const status = inviteStatus(row, stats, now);
    // 待使用邀请回显完整码与链接(存了明文的新邀请才有;老数据只有末4位,无从恢复)
    const displayCode =
      status === 'pending' && row.codePlain ? formatLifeInviteCode(row.codePlain) : null;
    return {
      id: String(row._id),
      codeHint: row.codeHint,
      code: displayCode,
      url: displayCode ? `${linkBase}/home#invite=${encodeURIComponent(displayCode)}` : null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status,
      inviter: inviter
        ? { id: String(inviter._id), name: inviter.name, email: inviter.email }
        : null,
      acceptedBy: acceptedUser
        ? {
            id: String(acceptedUser._id),
            name: acceptedUser.name,
            email: acceptedUser.email,
          }
        : null,
      acceptedAt: row.acceptedAt || null,
      conversationCount: stats?.conversations || 0,
      lastActive: stats?.lastActive || null,
    };
  });
  const legacyInvites = legacyRows.map((row, index) => ({
    id: `legacy-${index}-${new Date(row.createdAt).getTime()}`,
    codeHint: null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: row.expiresAt && new Date(row.expiresAt) <= now ? 'expired' : 'pending',
    inviter: null,
    acceptedBy: null,
    acceptedAt: null,
    conversationCount: 0,
    lastActive: null,
    legacy: true,
  }));
  return res.json({
    invites: [...durableInvites, ...legacyInvites]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100),
  });
});

admin.get('/users', async (_req, res) => {
  const [users, activity] = await Promise.all([
    mongoose.models.User.find({})
      .select({ name: 1, username: 1, email: 1, role: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    mongoose.models.Conversation.aggregate([
      { $group: { _id: '$user', conversations: { $sum: 1 }, lastActive: { $max: '$updatedAt' } } },
    ]),
  ]);
  const byUser = new Map(activity.map((row) => [String(row._id), row]));
  return res.json({
    users: users.map((user) => {
      const stats = byUser.get(String(user._id));
      return {
        id: String(user._id),
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        conversations: stats?.conversations || 0,
        lastActive: stats?.lastActive || null,
      };
    }),
  });
});

admin.delete('/users/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: { code: 'INVALID_USER_ID', message: '无效的用户 ID' } });
  }
  if (id === userId(req)) {
    return res.status(400).json({ error: { code: 'SELF_DELETE', message: '不能删除自己' } });
  }
  const target = await mongoose.models.User.findById(id).select({ role: 1 }).lean();
  if (!target) {
    return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: '用户不存在' } });
  }
  if (target.role === 'ADMIN') {
    return res.status(400).json({ error: { code: 'ADMIN_DELETE', message: '不能删除管理员' } });
  }
  const filter = byUserFilter(id);
  const cascade = ['Message', 'Conversation', 'Transaction', 'Session', 'Balance'];
  const removed = {};
  for (const name of cascade) {
    const model = mongoose.models[name];
    if (model) {
      removed[name] = (await model.deleteMany(filter)).deletedCount;
    }
  }
  await mongoose.models.User.deleteOne({ _id: id });
  logger.info(`[life][admin] user ${id} deleted by ${userId(req)}`, removed);
  return res.json({ deleted: true, removed });
});

admin.get('/status', async (_req, res) => {
  const [engineHealth, users] = await Promise.all([
    engine.json('/health').catch((error) => ({ ok: false, error: error.message })),
    mongoose.models.User.estimatedDocumentCount(),
  ]);
  return res.json({
    engine: engineHealth,
    mongo: mongoose.connection.readyState === 1,
    users,
    uptimeSec: Math.round(process.uptime()),
  });
});

admin.get('/runtime-config', async (_req, res) => {
  try {
    const [bundle, active] = await Promise.all([
      readRedactedPolicyBundle(runtimeConfigDir),
      engine.json('/internal/runtime-config'),
    ]);
    return res.json({ bundle, active });
  } catch (error) {
    logger.error('[life][admin] runtime config read failed', error);
    return res.status(503).json({
      error: { code: 'RUNTIME_CONFIG_UNAVAILABLE', message: '运行配置暂时不可读取' },
    });
  }
});

admin.post('/product-runtime/preview', async (req, res) => {
  const body = productPreviewBodyOf(req, res);
  if (!body) return;
  try {
    return res.json(
      await engine.json('/internal/product-runtime/preview', {
        method: 'POST',
        body,
      }),
    );
  } catch (error) {
    return engineError(res, error);
  }
});

// 规矩表:页面读到的就是配置本身;保存前先过引擎校验,保存后要求引擎 reload 并核对 SHA。
admin.get('/rules', async (_req, res) => {
  try {
    return res.json(await engine.json('/internal/rules'));
  } catch (error) {
    return engineError(res, error);
  }
});

admin.get('/rules/backups', async (_req, res) => {
  try {
    return res.json({ backups: await listRulesBackups(runtimeConfigDir) });
  } catch (error) {
    logger.error('[life][admin] rules backups read failed', error);
    return res.status(503).json({
      error: { code: 'RULES_BACKUPS_UNAVAILABLE', message: '回滚点暂时不可读取' },
    });
  }
});

admin.put('/rules', async (req, res) => {
  try {
    const result = await applyRulesConfig({
      configDir: runtimeConfigDir,
      document: req.body,
      actorId: userId(req),
      engine,
    });
    logger.info(`[life][admin] rules applied by ${userId(req)}`, {
      sha256: result.sha256,
      ruleCount: result.ruleCount,
    });
    return res.json(result);
  } catch (error) {
    logger.error('[life][admin] rules apply failed', error);
    return res.status(422).json({
      error: { code: 'RULES_APPLY_FAILED', message: error.message, retryable: false },
    });
  }
});

admin.post('/rules/rollback', async (req, res) => {
  const rollbackId = req.body?.rollbackId;
  if (typeof rollbackId !== 'string' || !rollbackId.length) {
    return res.status(422).json({
      error: { code: 'RULES_ROLLBACK_INVALID', message: '回滚点标识无效', retryable: false },
    });
  }
  try {
    const result = await restoreRulesBackup({
      configDir: runtimeConfigDir,
      rollbackId,
      actorId: userId(req),
      engine,
    });
    logger.info(`[life][admin] rules rolled back by ${userId(req)}`, { rollbackId });
    return res.json(result);
  } catch (error) {
    logger.error('[life][admin] rules rollback failed', error);
    return res.status(422).json({
      error: { code: 'RULES_ROLLBACK_FAILED', message: error.message, retryable: false },
    });
  }
});

admin.get('/product-observability/results', async (req, res) => {
  const query = observabilityQueryOf(req, res);
  if (!query) return;
  const search = new URLSearchParams({ windowDays: String(query.windowDays) });
  if (query.experimentId !== undefined) {
    search.set('experimentId', query.experimentId);
  }
  try {
    return res.json(await engine.json(`/internal/product-observability/results?${search}`));
  } catch (error) {
    return engineError(res, error);
  }
});

admin.post('/runtime-config/apply', async (req, res) => {
  const actorId = userId(req);
  const kind = req.body?.kind;
  const document = req.body?.document;
  if (
    !['runtime', 'security_contract', 'product_catalog'].includes(kind) ||
    !document ||
    typeof document !== 'object' ||
    Array.isArray(document)
  ) {
    return res.status(422).json({
      error: { code: 'RUNTIME_CONFIG_REQUEST_INVALID', message: '配置申请内容无效' },
    });
  }
  try {
    const result = await applyRuntimeConfig({
      configDir: runtimeConfigDir,
      kind,
      document,
      actorId,
      engine,
    });
    return res.json(result);
  } catch (error) {
    if (error instanceof LifeEngineError) return engineError(res, error);
    logger.error('[life][admin] runtime config apply failed', error);
    return res.status(503).json({
      error: { code: 'RUNTIME_CONFIG_APPLY_FAILED', message: '配置应用失败，已尝试恢复上一版' },
    });
  }
});

admin.get('/copy', async (_req, res) => {
  const rows = await LifeCopy.find({})
    .select({ _id: 0, key: 1, value: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .lean();
  return res.json({ overrides: rows });
});

admin.put('/copy', async (req, res) => {
  const key = String(req.body?.key || '');
  const value = String(req.body?.value ?? '');
  if (!COPY_KEY_PATTERN.test(key)) {
    return res.status(422).json({ error: { code: 'INVALID_COPY_KEY', message: '无效的文案 key' } });
  }
  if (value.length > 2000) {
    return res
      .status(422)
      .json({ error: { code: 'COPY_TOO_LONG', message: '文案不能超过 2000 字' } });
  }
  if (value.trim() === '') {
    await LifeCopy.deleteOne({ key });
    return res.json({ key, restored: true });
  }
  await LifeCopy.updateOne({ key }, { $set: { value } }, { upsert: true });
  return res.json({ key, value });
});

module.exports = router;
