import type { TOptions } from 'i18next';
import type { TranslationKeys } from '~/hooks';

/**
 * system-tag 触发消息(开场编排协议 §2):血条提交/继续下一章/回来续聊由系统注入,
 * 文本带 `[trigger:<kind>] ` 前缀标记——它们不是用户原话,证据层按前缀排除。
 * 渲染层剥掉前缀,用户看到的仍是原人话文案。
 */
const TRIGGER_PREFIX = /^\[trigger:[a-z_]+\]\s*/;
const HOUSE_ENTRY_TRIGGER =
  /^\[trigger:house_entered\]\s+entryHouse=([^;\s]+);visitMode=([a-z_]+)\s*$/;
const HOUSE_ID = /^h(?:[1-9]|1[0-2])$/;

const HOUSE_ENTRY_LABEL_KEYS: Record<string, TranslationKeys> = {
  first_entry: 'com_life_trigger_house_first_entry',
  return_entry: 'com_life_trigger_house_return_entry',
  continue: 'com_life_trigger_house_continue',
};

export function stripTriggerTag(
  text: string,
  localize: (key: TranslationKeys, options?: TOptions) => string,
): string {
  const houseEntry = text.match(HOUSE_ENTRY_TRIGGER);
  if (houseEntry) {
    const [, entryHouse, visitMode] = houseEntry;
    const labelKey = HOUSE_ENTRY_LABEL_KEYS[visitMode];
    if (!HOUSE_ID.test(entryHouse) || !labelKey) {
      return localize('com_life_trigger_house_fallback');
    }
    if (visitMode === 'continue') return localize(labelKey);
    const houseName = localize(`com_life_map_house_${entryHouse}` as TranslationKeys);
    return localize(labelKey, { 0: houseName });
  }
  return text.replace(TRIGGER_PREFIX, '');
}

export function isTriggerMessage(text: string): boolean {
  return TRIGGER_PREFIX.test(text);
}

export function isNativeFirstEntryTrigger(text: string): boolean {
  const houseEntry = text.match(HOUSE_ENTRY_TRIGGER);
  return houseEntry?.[2] === 'first_entry' && HOUSE_ID.test(houseEntry[1]);
}
