/**
 * system-tag 触发消息(开场编排协议 §2):血条提交/继续下一章/回来续聊由系统注入,
 * 文本带 `[trigger:<kind>] ` 前缀标记——它们不是用户原话,证据层按前缀排除。
 * 渲染层剥掉前缀,用户看到的仍是原人话文案。
 */
const TRIGGER_PREFIX = /^\[trigger:[a-z_]+\]\s*/;
const HOUSE_ENTRY_TRIGGER =
  /^\[trigger:house_entered\]\s+entryHouse=[^;\s]+;visitMode=([a-z_]+)\s*$/;

const HOUSE_ENTRY_LABELS: Record<string, string> = {
  first_entry: '从这块开始聊。',
  return_entry: '回到这块继续聊。',
  continue: '从上次停下的地方继续。',
};

export function stripTriggerTag(text: string): string {
  const houseEntry = text.match(HOUSE_ENTRY_TRIGGER);
  if (houseEntry) {
    return HOUSE_ENTRY_LABELS[houseEntry[1]] ?? '从这块开始聊。';
  }
  return text.replace(TRIGGER_PREFIX, '');
}

export function isTriggerMessage(text: string): boolean {
  return TRIGGER_PREFIX.test(text);
}
