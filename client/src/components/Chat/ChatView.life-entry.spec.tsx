/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import type { ComponentType, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import ChatView from './ChatView';

const mockEntryCard = {
  version: 1 as const,
  entryHouse: 'h6',
  options: [
    { id: 'one', text: '第一句' },
    { id: 'two', text: '第二句' },
    { id: 'three', text: '第三句' },
  ],
  escape: '也可以直接自己写。',
};

const mockEntryText = [
  '先从最近这段工作聊起。',
  '',
  '需要时借一句开头：',
  '- 第一句',
  '- 第二句',
  '- 第三句',
  '也可以直接自己写。',
].join('\n');

jest.mock('react-router-dom', () => ({
  useParams: () => ({ conversationId: 'conversation-1' }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
}));

jest.mock('librechat-data-provider', () => ({
  Constants: { NEW_CONVO: 'new' },
  buildTree: ({ messages }: { messages: unknown[] }) => messages,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    submissionByIndex: () => 'submission',
    isSubmittingFamily: () => 'is-submitting',
  },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  getLatestText: (message?: { text?: string } | null) => message?.text ?? '',
}));

jest.mock('~/hooks', () => ({
  useAddedResponse: () => ({}),
  useResumeOnLoad: () => undefined,
  useAdaptiveSSE: () => undefined,
  useChatHelpers: () => ({ getMessages: jest.fn() }),
  useLatestMessage: () => ({ isCreatedByUser: false, text: mockEntryText }),
  useLocalize: () => (key: string) => {
    const copy: Record<string, string> = {
      com_life_entry_composer_placeholder: '想到哪写到哪；一两句也可以',
      com_life_entry_options_helper: '写不出来？先借一句开头。',
      com_life_entry_recent_days: '最近的日子',
      com_life_entry_suggestion_note: '点一下只会放进输入框，不会直接发出。',
      com_life_entry_suggestion_refresh: '换一句',
      com_life_entry_suggestion_dismiss: '都不对，我自己说',
      com_life_entry_suggestion_reopen: '给我一句开头',
      com_life_map_house_h6: '工作',
    };
    if (key === 'com_life_entry_suggestion_quote') return '「第一句」';
    return copy[key] ?? key;
  },
}));

jest.mock('~/Providers', () => {
  const Provider = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    ChatContext: { Provider },
    AddedChatContext: { Provider },
    ChatFormProvider: Provider,
    useFileMapContext: () => new Map(),
    useChatFormContext: () => ({ setValue: jest.fn() }),
    useMessageContext: () => ({ isLatestMessage: true }),
  };
});

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: [{}], isLoading: false }),
}));

jest.mock('./Messages/MessagesView', () => {
  const LifeEntryOptions = jest.requireActual('./Messages/Content/LifeEntryOptions')
    .default as ComponentType<{ card: typeof mockEntryCard; prompt: string }>;
  return () => <LifeEntryOptions card={mockEntryCard} prompt="先从最近这段工作聊起。" />;
});

jest.mock('./Input/ChatForm', () => ({ placeholder }: { placeholder?: string }) => (
  <textarea aria-label="唯一聊天输入框" placeholder={placeholder} />
));

jest.mock('./Presentation', () => ({ children }: { children: ReactNode }) => <>{children}</>);
jest.mock('./Header', () => () => null);
jest.mock('./Footer', () => () => null);
jest.mock('./Landing', () => () => null);
jest.mock('./Input/ConversationStarters', () => () => null);
jest.mock('./ProjectLandingChip', () => () => null);
jest.mock('~/features/life-design/components/LifeArchiveDrawer', () => () => (
  <button aria-label="人生档案浮标" />
));

test('完整 ChatView 的首入态同时只有唯一 ChatForm 文本框', () => {
  render(<ChatView />);

  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '想到哪写到哪；一两句也可以');
  expect(screen.queryByRole('button', { name: '人生档案浮标' })).not.toBeInTheDocument();
});
