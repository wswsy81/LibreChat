import { render, screen } from '@testing-library/react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import HoverButtons from '../HoverButtons';

const mockForkLabel = 'Open fork menu';

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilState: () => [false, jest.fn()],
}));

jest.mock('@librechat/client', () => ({
  CheckMark: () => <span aria-hidden="true" />,
  Clipboard: () => <span aria-hidden="true" />,
  ContinueIcon: () => <span aria-hidden="true" />,
  RegenerateIcon: () => <span aria-hidden="true" />,
}));

jest.mock('~/components/Conversations', () => ({
  Fork: () => <button aria-label={mockForkLabel} />,
}));

jest.mock('~/hooks', () => ({
  useGenerationsByLatest: () => ({
    hideEditButton: false,
    regenerateEnabled: false,
    continueSupported: false,
    forkingSupported: true,
    isEditableEndpoint: true,
  }),
  useLocalize: () => (key: string) =>
    ({
      com_ui_copy_to_clipboard: 'Copy',
      com_ui_copied_to_clipboard: 'Copied',
      com_ui_edit: 'Edit',
    })[key] ?? key,
}));

describe('HoverButtons for Life Design Studio', () => {
  it('keeps copy while hiding edit and conversation fork actions', () => {
    const conversation: TConversation = {
      conversationId: 'conversation-1',
      endpoint: null,
      title: 'Life Design Studio',
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    };
    const message = {
      messageId: 'message-1',
      isCreatedByUser: true,
      text: 'hello',
    } as TMessage;

    render(
      <HoverButtons
        index={0}
        isEditing={false}
        enterEdit={jest.fn()}
        copyToClipboard={jest.fn()}
        conversation={conversation}
        isSubmitting={false}
        message={message}
        regenerate={jest.fn()}
        handleContinue={jest.fn()}
        latestMessageId="message-1"
        isLast={true}
      />,
    );

    expect(screen.getByTitle('Copy')).toBeInTheDocument();
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: mockForkLabel })).not.toBeInTheDocument();
  });
});
