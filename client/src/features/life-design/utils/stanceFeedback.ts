import type {
  LifeStanceFeedbackRequest,
  LifeStanceSelection,
  LifeStanceLevel,
} from 'librechat-data-provider';

export const STANCE_SELECTIONS: readonly LifeStanceSelection[] = [
  'more_direct',
  'just_right',
  'less_direct',
];

const LEVELS: readonly LifeStanceLevel[] = ['restrained', 'direct', 'decisive'];
const POLICY_VERSION_PATTERN = /^[a-z0-9-]{1,64}$/;

export interface StanceFeedbackMessage {
  reportId: string;
  payload: LifeStanceFeedbackRequest;
}

export interface StanceFeedbackError {
  code: string | null;
  retryable: boolean;
}

const isSelection = (value: unknown): value is LifeStanceSelection =>
  STANCE_SELECTIONS.includes(value as LifeStanceSelection);

const isLevel = (value: unknown): value is LifeStanceLevel =>
  LEVELS.includes(value as LifeStanceLevel);

/**
 * 报告 iframe 的 `connect-src` 是 'none',反馈只经 postMessage 交给父壳代写。
 * 这里逐字段校验冻结合同,并只放行 API 允许的四个字段。
 */
export function stanceFeedbackFromMessage(data: unknown): StanceFeedbackMessage | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as { type?: unknown; payload?: unknown };
  if (message.type !== 'life-reveal-stance-feedback') return null;
  if (!message.payload || typeof message.payload !== 'object') return null;

  const payload = message.payload as {
    reportId?: unknown;
    reportVersion?: unknown;
    selection?: unknown;
    effectiveLevel?: unknown;
    stancePolicyVersion?: unknown;
  };
  if (typeof payload.reportId !== 'string' || !payload.reportId) return null;
  if (!Number.isInteger(payload.reportVersion) || (payload.reportVersion as number) < 1)
    return null;
  if (!isSelection(payload.selection) || !isLevel(payload.effectiveLevel)) return null;
  if (
    typeof payload.stancePolicyVersion !== 'string' ||
    !POLICY_VERSION_PATTERN.test(payload.stancePolicyVersion)
  ) {
    return null;
  }

  return {
    reportId: payload.reportId,
    payload: {
      reportVersion: payload.reportVersion as number,
      selection: payload.selection,
      effectiveLevel: payload.effectiveLevel,
      stancePolicyVersion: payload.stancePolicyVersion,
    },
  };
}

/** 只按 code/retryable 处理,不按 message 分支(两层的 message 都可能改)。 */
export function stanceFeedbackErrorOf(error: unknown): StanceFeedbackError {
  const body = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (!body || typeof body !== 'object') {
    return { code: null, retryable: true };
  }
  const coded = body as { code?: unknown; retryable?: unknown };
  return {
    code: typeof coded.code === 'string' ? coded.code : null,
    retryable: coded.retryable !== false,
  };
}

/** 重试必须复用同一个 key(服务端才会重放而不是记两条);改选换新 key。 */
export function createIdempotencyKey() {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return `stance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 事件源必须是本壳内的报告 iframe,避免另一个界面的报告被同一个监听器重复提交。 */
export function isFrameEventSource(container: HTMLElement | null, source: unknown) {
  if (!container || !source) return false;
  const frames = Array.from(container.querySelectorAll('iframe'));
  return frames.some((frame) => frame.contentWindow === source);
}
