/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LifeEntryOptions from './LifeEntryOptions';

const mockSetValue = jest.fn();

jest.mock('~/Providers', () => ({
  useChatFormContext: () => ({ setValue: mockSetValue }),
  useMessageContext: () => ({ isLatestMessage: true }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<number, string>) => {
    const copy: Record<string, string> = {
      com_life_entry_options_helper: '写不出来？先借一句开头。',
      com_life_entry_recent_days: '最近的日子',
      com_life_entry_suggestion_note: '点一下只会放进输入框，不会直接发出。',
      com_life_entry_suggestion_refresh: '换一句',
      com_life_entry_suggestion_dismiss: '都不对，我自己说',
      com_life_entry_suggestion_reopen: '给我一句开头',
      com_life_map_house_h6: '工作',
    };
    if (key === 'com_life_entry_suggestion_use') return `用这句开头：${values?.[0] ?? ''}`;
    if (key === 'com_life_entry_suggestion_quote') return `「${values?.[0] ?? ''}」`;
    return copy[key] ?? key;
  },
}));

const card = {
  version: 1 as const,
  entryHouse: 'h6',
  options: [
    { id: 'one', text: '每天都在忙，说不出忙了什么' },
    { id: 'two', text: '脑子停不下来，睡也睡不好' },
    { id: 'three', text: '身体先撑不住了，事还在' },
  ],
  escape: '不想从工作说起也行，先讲件别的。',
};

let composer: HTMLTextAreaElement;

beforeEach(() => {
  jest.clearAllMocks();
  composer = document.createElement('textarea');
  composer.id = 'prompt-textarea';
  document.body.appendChild(composer);
});

afterEach(() => {
  composer.remove();
});

test('原生轻题头保留完整开场，但组件自身不再创建第二个输入框', () => {
  const { container } = render(<LifeEntryOptions card={card} prompt="先从最近这段工作聊起。" />);

  expect(container.querySelector('textarea')).toBeNull();
  expect(screen.getByText('工作')).toBeInTheDocument();
  expect(screen.getByText('最近的日子')).toBeInTheDocument();
  expect(screen.getByText('先从最近这段工作聊起。')).toBeInTheDocument();
  expect(screen.getByText(`「${card.options[0].text}」`)).toBeInTheDocument();
  expect(screen.queryByText(`「${card.options[1].text}」`)).not.toBeInTheDocument();
});

test('点建议只写入唯一 ChatForm 草稿并聚焦，不调用发送链', () => {
  render(<LifeEntryOptions card={card} prompt="先从最近这段工作聊起。" />);

  fireEvent.click(screen.getByRole('button', { name: `用这句开头：${card.options[0].text}` }));

  expect(mockSetValue).toHaveBeenCalledWith('text', card.options[0].text, {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  });
  expect(document.activeElement).toBe(composer);
});

test('换一句只轮换当前单句，不覆盖已有草稿', () => {
  render(<LifeEntryOptions card={card} prompt="先从最近这段工作聊起。" />);

  fireEvent.click(screen.getByRole('button', { name: '换一句' }));

  expect(screen.getByText(`「${card.options[1].text}」`)).toBeInTheDocument();
  expect(screen.queryByText(`「${card.options[0].text}」`)).not.toBeInTheDocument();
  expect(mockSetValue).not.toHaveBeenCalled();
});

test('都不对时建议退场并把焦点交还输入框，也可以重新打开', () => {
  render(<LifeEntryOptions card={card} prompt="先从最近这段工作聊起。" />);

  fireEvent.click(screen.getByRole('button', { name: '都不对，我自己说' }));

  expect(screen.queryByText(`「${card.options[0].text}」`)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '给我一句开头' })).toBeInTheDocument();
  expect(document.activeElement).toBe(composer);
});
