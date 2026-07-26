import { render, screen } from '@testing-library/react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import McpUIResources from './McpUIResources';
import { useMessageContext } from '~/Providers';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useMessageContext: jest.fn(),
  useOptionalMessagesOperations: () => ({ ask: jest.fn() }),
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
  UIResourceRenderer: ({ resource }: { resource: { uri: string } }) => (
    <div data-testid="ui-resource-renderer" data-resource-uri={resource.uri} />
  ),
}));

jest.mock('./UIResourceCarousel', () => () => <div data-testid="ui-resource-carousel" />);

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;

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
});
