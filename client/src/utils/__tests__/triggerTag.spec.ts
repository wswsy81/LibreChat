import { stripTriggerTag, isTriggerMessage } from '../triggerTag';
import type { TOptions } from 'i18next';
import type { TranslationKeys } from '~/hooks';

const copy = {
  com_life_trigger_house_first_entry: '先说说{{0}}这块。',
  com_life_trigger_house_return_entry: '回到{{0}}这块，接着说。',
  com_life_trigger_house_continue: '从上次停下的地方继续。',
  com_life_trigger_house_fallback: '就从这块说起。',
  com_life_map_house_h2: '财务',
  com_life_map_house_h6: '工作',
  com_life_map_house_h10: '事业',
} as const;
const localize = (key: TranslationKeys, options?: TOptions) =>
  (copy[key as keyof typeof copy] ?? key).replace('{{0}}', String(options?.[0] ?? ''));

describe('triggerTag', () => {
  it('剥掉 system-tag 前缀,保留人话正文', () => {
    expect(
      stripTriggerTag('[trigger:onboarding_completed] 我的人生血条(0-10)：工作 3。', localize),
    ).toBe('我的人生血条(0-10)：工作 3。');
    expect(stripTriggerTag('[trigger:session_resumed] 我回来了。', localize)).toBe('我回来了。');
    expect(stripTriggerTag('[trigger:chapter_continue] 继续,进入下一章。', localize)).toBe(
      '继续,进入下一章。',
    );
  });

  it('house_entered 按不同地图块显示对应块名，不泄露元数据', () => {
    expect(
      stripTriggerTag('[trigger:house_entered] entryHouse=h2;visitMode=first_entry', localize),
    ).toBe('先说说财务这块。');
    expect(
      stripTriggerTag('[trigger:house_entered] entryHouse=h6;visitMode=return_entry', localize),
    ).toBe('回到工作这块，接着说。');
    expect(
      stripTriggerTag('[trigger:house_entered] entryHouse=h10;visitMode=first_entry', localize),
    ).toBe('先说说事业这块。');
    expect(
      stripTriggerTag('[trigger:house_entered] entryHouse=h10;visitMode=return_entry', localize),
    ).toBe('回到事业这块，接着说。');
    expect(
      stripTriggerTag('[trigger:house_entered] entryHouse=h10;visitMode=continue', localize),
    ).toBe('从上次停下的地方继续。');
    expect(
      stripTriggerTag('[trigger:house_entered] entryHouse=h13;visitMode=unexpected', localize),
    ).toBe('就从这块说起。');
  });

  it('普通用户消息原样返回,不误剥', () => {
    expect(stripTriggerTag('我说 [trigger:xxx] 不在开头', localize)).toBe(
      '我说 [trigger:xxx] 不在开头',
    );
    expect(stripTriggerTag('普通消息', localize)).toBe('普通消息');
  });

  it('isTriggerMessage 只认开头前缀', () => {
    expect(isTriggerMessage('[trigger:onboarding_completed] x')).toBe(true);
    expect(isTriggerMessage('x [trigger:onboarding_completed]')).toBe(false);
  });
});
