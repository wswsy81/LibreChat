import { render, screen } from '@testing-library/react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import Message from '../Message';

const conversation = {
  conversationId: 'conversation-first-entry',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

jest.mock('~/hooks', () => ({
  useMessageProcess: () => ({
    conversation,
    handleScroll: jest.fn(),
    isSubmitting: false,
  }),
  useMemoizedChatContext: () => ({
    chatContext: {},
    effectiveIsSubmitting: false,
  }),
}));

jest.mock('../ui/MessageRender', () => ({
  __esModule: true,
  default: ({ message }: { message: TMessage }) => (
    <div data-testid="message-row">{message.text}</div>
  ),
}));

jest.mock('../MultiMessage', () => ({
  __esModule: true,
  default: ({ messagesTree }: { messagesTree?: TMessage[] }) => (
    <div data-testid="child-tree">{messagesTree?.map((message) => message.text).join('|')}</div>
  ),
}));

function renderMessage(message: TMessage) {
  return render(<Message message={message} currentEditId={null} setCurrentEditId={jest.fn()} />);
}

describe('native first-entry trigger visibility', () => {
  const assistantOpening = {
    messageId: 'assistant-opening',
    parentMessageId: 'system-entry',
    conversationId: conversation.conversationId,
    text: '原生轻题头与自然对话',
    isCreatedByUser: false,
  } as TMessage;

  it('hides the mechanical first-entry row while preserving its assistant opening', () => {
    renderMessage({
      messageId: 'system-entry',
      parentMessageId: 'root',
      conversationId: conversation.conversationId,
      text: '[trigger:house_entered] entryHouse=h6;visitMode=first_entry',
      isCreatedByUser: true,
      children: [assistantOpening],
    } as TMessage);

    expect(screen.queryByTestId('message-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('child-tree')).toHaveTextContent('原生轻题头与自然对话');
  });

  it('keeps return-entry rows visible', () => {
    renderMessage({
      messageId: 'return-entry',
      parentMessageId: 'root',
      conversationId: conversation.conversationId,
      text: '[trigger:house_entered] entryHouse=h6;visitMode=return_entry',
      isCreatedByUser: true,
      children: [assistantOpening],
    } as TMessage);

    expect(screen.getByTestId('message-row')).toHaveTextContent('visitMode=return_entry');
    expect(screen.getByTestId('child-tree')).toHaveTextContent('原生轻题头与自然对话');
  });
});
