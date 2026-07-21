/**
 * system-tag 触发消息(开场编排协议 §2):血条提交/继续下一章/回来续聊由系统注入,
 * 文本带 `[trigger:<kind>] ` 前缀标记——它们不是用户原话,证据层按前缀排除。
 * 渲染层剥掉前缀,用户看到的仍是原人话文案。
 */
const TRIGGER_PREFIX = /^\[trigger:[a-z_]+\]\s*/;

export function stripTriggerTag(text: string): string {
  return text.replace(TRIGGER_PREFIX, '');
}

export function isTriggerMessage(text: string): boolean {
  return TRIGGER_PREFIX.test(text);
}
