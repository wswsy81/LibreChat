import { stripTriggerTag, isTriggerMessage } from '../triggerTag';

describe('triggerTag', () => {
  it('剥掉 system-tag 前缀,保留人话正文', () => {
    expect(stripTriggerTag('[trigger:onboarding_completed] 我的人生血条(0-10)：工作 3。')).toBe(
      '我的人生血条(0-10)：工作 3。',
    );
    expect(stripTriggerTag('[trigger:session_resumed] 我回来了。')).toBe('我回来了。');
    expect(stripTriggerTag('[trigger:chapter_continue] 继续,进入下一章。')).toBe('继续,进入下一章。');
  });

  it('普通用户消息原样返回,不误剥', () => {
    expect(stripTriggerTag('我说 [trigger:xxx] 不在开头')).toBe('我说 [trigger:xxx] 不在开头');
    expect(stripTriggerTag('普通消息')).toBe('普通消息');
  });

  it('isTriggerMessage 只认开头前缀', () => {
    expect(isTriggerMessage('[trigger:onboarding_completed] x')).toBe(true);
    expect(isTriggerMessage('x [trigger:onboarding_completed]')).toBe(false);
  });
});
