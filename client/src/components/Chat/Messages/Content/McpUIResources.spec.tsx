import { Tools } from 'librechat-data-provider';
import { act, render, screen } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import type { UIActionResult } from '@mcp-ui/client';
import { useMessageContext } from '~/Providers';
import McpUIResources from './McpUIResources';

const mockAsk = jest.fn();
const mockNavigate = jest.fn();
let mockOnUIAction: ((result: UIActionResult) => Promise<void> | void) | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('~/Providers', () => ({
  useMessageContext: jest.fn(),
  useOptionalMessagesConversation: () => ({ conversationId: 'conv-1' }),
  useOptionalMessagesOperations: () => ({ ask: mockAsk }),
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  handleUIAction: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useLifeStanceFeedbackMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@mcp-ui/client', () => ({
  UIResourceRenderer: ({
    resource,
    onUIAction,
  }: {
    resource: { uri: string };
    onUIAction: (result: UIActionResult) => Promise<void> | void;
  }) => {
    mockOnUIAction = onUIAction;
    return <div data-testid="ui-resource-renderer" data-resource-uri={resource.uri} />;
  },
}));

jest.mock('./UIResourceCarousel', () => () => <div data-testid="ui-resource-carousel" />);

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockOnUIAction = undefined;
});

function attachment(uri: string): TAttachment[] {
  return [
    {
      type: Tools.ui_resources,
      messageId: 'message-1',
      toolCallId: 'tool-1',
      [Tools.ui_resources]: [
        {
          resourceId: 'resource-1',
          uri,
          mimeType: 'text/html',
          text: '<p>Resource</p>',
        },
      ],
    },
  ];
}

describe('McpUIResources one-shot lifecycle', () => {
  it('hides an answered topic picker rendered from tool attachments', () => {
    mockUseMessageContext.mockReturnValue({ isLatestMessage: false } as never);

    const { container } = render(
      <McpUIResources attachments={attachment('ui://future-lines/topics')} toolCallId="tool-1" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('keeps persistent artifacts rendered from historical tool attachments', () => {
    mockUseMessageContext.mockReturnValue({ isLatestMessage: false } as never);

    render(
      <McpUIResources attachments={attachment('ui://future-lines/report')} toolCallId="tool-1" />,
    );

    expect(screen.getByTestId('ui-resource-renderer')).toHaveAttribute(
      'data-resource-uri',
      'ui://future-lines/report',
    );
  });

  it('turns historical chapter continuation links into a prompt on the current long page', async () => {
    mockUseMessageContext.mockReturnValue({ isLatestMessage: false } as never);
    render(
      <McpUIResources attachments={attachment('ui://future-lines/report')} toolCallId="tool-1" />,
    );

    const params = new URLSearchParams({
      q: '[trigger:chapter_continue] 继续,进入下一章。',
      submit: 'true',
    });
    await act(async () => {
      await mockOnUIAction?.({
        type: 'link',
        payload: { url: `https://yiweilife.com/c/new?${params.toString()}` },
      });
    });

    expect(mockAsk).toHaveBeenCalledWith({
      text: '[trigger:chapter_continue] 继续,进入下一章。',
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps ordinary internal links as SPA navigation', async () => {
    mockUseMessageContext.mockReturnValue({ isLatestMessage: false } as never);
    render(
      <McpUIResources attachments={attachment('ui://future-lines/report')} toolCallId="tool-1" />,
    );

    await act(async () => {
      await mockOnUIAction?.({
        type: 'link',
        payload: { url: 'https://yiweilife.com/archive' },
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/archive');
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
