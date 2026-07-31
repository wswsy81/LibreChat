/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LifeEntryOptions from './LifeEntryOptions';

const mockSubmitMessage = jest.fn();

jest.mock('~/hooks', () => ({
  useSubmitMessage: () => ({ submitMessage: mockSubmitMessage }),
  useLocalize: () => (key: string) => key,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmitMessage.mockReturnValue(true);
});

test('大输入框在主位，选项只作为写不出来时的引子', () => {
  render(<LifeEntryOptions card={card} />);

  const textbox = screen.getByRole('textbox');
  const firstOption = screen.getByRole('button', { name: card.options[0].text });
  expect(textbox).toHaveAttribute('placeholder', 'com_life_entry_freeform_placeholder');
  expect(
    textbox.compareDocumentPosition(firstOption) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText('com_life_entry_options_helper')).toBeInTheDocument();
});

test('自由讲述沿用现有 submitMessage，提交时去掉首尾空白', () => {
  render(<LifeEntryOptions card={card} />);

  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '  我一直在改，却没有一版敢交出去。  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_entry_freeform_submit' }));
  expect(mockSubmitMessage).toHaveBeenCalledWith({ text: '我一直在改，却没有一版敢交出去。' });
});

test('仍可点一句引子进入对话', () => {
  render(<LifeEntryOptions card={card} />);
  fireEvent.click(screen.getByRole('button', { name: card.options[1].text }));
  expect(mockSubmitMessage).toHaveBeenCalledWith({ text: card.options[1].text });
});
