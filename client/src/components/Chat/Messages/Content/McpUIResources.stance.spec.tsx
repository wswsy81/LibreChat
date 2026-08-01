import { Tools } from 'librechat-data-provider';
import { act, render, screen } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import type { LifeStanceFeedbackVariables } from '~/data-provider/Life/mutations';
import McpUIResources from './McpUIResources';

const mockMutate = jest.fn();

jest.mock('@mcp-ui/client', () => ({
  UIResourceRenderer: () => <iframe title="mcp-report" data-testid="mcp-report-frame" />,
}));
jest.mock('./UIResourceCarousel', () => () => <div data-testid="mcp-carousel" />);
jest.mock('~/components/MCPUIResource/lifecycle', () => ({
  shouldRenderUIResource: () => true,
}));
jest.mock('~/Providers', () => ({
  useMessageContext: () => ({ isLatestMessage: true }),
  useOptionalMessagesConversation: () => ({ conversationId: 'conversation-1' }),
  useOptionalMessagesOperations: () => ({ ask: jest.fn() }),
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('~/utils', () => ({ handleUIAction: jest.fn() }));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/data-provider', () => ({
  useLifeStanceFeedbackMutation: () => ({ mutate: mockMutate }),
}));

const attachments: TAttachment[] = [
  {
    type: Tools.ui_resources,
    messageId: 'message-1',
    toolCallId: 'call-1',
    [Tools.ui_resources]: [
      {
        resourceId: 'report-resource-1',
        uri: 'ui://future-lines/report',
        mimeType: 'text/html',
        text: '<html></html>',
      },
    ],
  } as unknown as TAttachment,
];

const stanceMessage = {
  type: 'life-reveal-stance-feedback',
  payload: {
    reportId: 'report-1',
    reportVersion: 1,
    selection: 'more_direct',
    effectiveLevel: 'direct',
    stancePolicyVersion: 'stance-v1',
  },
};

function renderInline() {
  render(<McpUIResources attachments={attachments} toolCallId="call-1" />);
  return screen.getByTestId('mcp-report-frame') as HTMLIFrameElement;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('records feedback from a report embedded in the conversation', () => {
  const frame = renderInline();
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: stanceMessage,
        source: frame.contentWindow as Window,
      }),
    );
  });

  const [variables] = mockMutate.mock.calls[0] as [LifeStanceFeedbackVariables];
  expect(variables.reportId).toBe('report-1');
  expect(variables.payload.selection).toBe('more_direct');
  expect(screen.getByTestId('life-stance-feedback-status')).toHaveTextContent(
    'com_life_stance_feedback_saving',
  );
});

test('stays silent until a report actually asks for feedback', () => {
  renderInline();
  expect(screen.queryByTestId('life-stance-feedback-status')).not.toBeInTheDocument();
  expect(mockMutate).not.toHaveBeenCalled();
});
