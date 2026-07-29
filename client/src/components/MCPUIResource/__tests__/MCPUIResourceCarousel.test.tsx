import React from 'react';
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { MCPUIResourceCarousel } from '../MCPUIResourceCarousel';
import {
  useMessageContext,
  useOptionalMessagesConversation,
  useOptionalMessagesOperations,
} from '~/Providers';

// Mock dependencies
jest.mock('~/Providers');

jest.mock('../../Chat/Messages/Content/UIResourceCarousel', () => ({
  __esModule: true,
  default: ({ uiResources }: any) => (
    <div data-testid="ui-resource-carousel" data-resource-count={uiResources.length}>
      {uiResources.map((resource: any, index: number) => (
        <div key={index} data-testid={`resource-${index}`} data-resource-uri={resource.uri} />
      ))}
    </div>
  ),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseMessagesConversation = useOptionalMessagesConversation as jest.MockedFunction<
  typeof useOptionalMessagesConversation
>;
const mockUseMessagesOperations = useOptionalMessagesOperations as jest.MockedFunction<
  typeof useOptionalMessagesOperations
>;

describe('MCPUIResourceCarousel', () => {
  // Store the current test's messages so getMessages can return them
  let currentTestMessages: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    currentTestMessages = [];
    mockUseMessageContext.mockReturnValue({ messageId: 'msg123', isLatestMessage: true } as any);
    mockUseMessagesConversation.mockReturnValue({
      conversation: { conversationId: 'conv123' },
      conversationId: 'conv123',
    } as any);
    mockUseMessagesOperations.mockReturnValue({
      getMessages: () => currentTestMessages,
      ask: jest.fn(),
      regenerate: jest.fn(),
      handleContinue: jest.fn(),
      setMessages: jest.fn(),
    } as any);
  });

  const renderWithRecoil = (ui: React.ReactNode) => render(<RecoilRoot>{ui}</RecoilRoot>);

  describe('multiple resource fetching', () => {
    it('should fetch resources by resourceIds across conversation messages', () => {
      mockUseMessageContext.mockReturnValue({ messageId: 'msg-current' } as any);
      currentTestMessages = [
        {
          messageId: 'msg-origin',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'id-1',
                  uri: 'ui://test/resource-id1',
                  mimeType: 'text/html',
                  text: '<p>Resource via ID 1</p>',
                },
                {
                  resourceId: 'id-2',
                  uri: 'ui://test/resource-id2',
                  mimeType: 'text/html',
                  text: '<p>Resource via ID 2</p>',
                },
              ],
            },
          ],
        },
        {
          messageId: 'msg-current',
          attachments: [],
        },
      ];

      renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['id-2', 'id-1'] } }} />,
      );

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '2');

      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource-id2',
      );
      expect(screen.getByTestId('resource-1')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/resource-id1',
      );
    });

    it('removes answered topic pickers but keeps persistent resources in a mixed carousel', () => {
      mockUseMessageContext.mockReturnValue({
        messageId: 'msg123',
        isLatestMessage: false,
      } as any);
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'topics-1',
                  uri: 'ui://future-lines/topics',
                  mimeType: 'text/html',
                  text: '<p>Topics</p>',
                },
                {
                  resourceId: 'report-1',
                  uri: 'ui://future-lines/report',
                  mimeType: 'text/html',
                  text: '<p>Report</p>',
                },
              ],
            },
          ],
        },
      ];

      renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['topics-1', 'report-1'] } }} />,
      );

      expect(screen.getByTestId('ui-resource-carousel')).toHaveAttribute(
        'data-resource-count',
        '1',
      );
      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://future-lines/report',
      );
    });
  });

  describe('error handling', () => {
    it('filters invalid payloads and does not pass them to the carousel renderer', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'valid',
                  uri: 'ui://test/valid',
                  mimeType: 'text/html',
                  text: '<p>valid</p>',
                },
                {
                  resourceId: 'invalid',
                  uri: 'ui://test/invalid',
                  mimeType: 'application/json',
                  text: '{}',
                },
              ],
            },
          ],
        },
      ];

      renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['invalid', 'valid'] } }} />,
      );

      expect(screen.getByTestId('ui-resource-carousel')).toHaveAttribute(
        'data-resource-count',
        '1',
      );
      expect(screen.getByTestId('resource-0')).toHaveAttribute(
        'data-resource-uri',
        'ui://test/valid',
      );
    });

    it('should return null when no attachments', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: undefined,
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['id1', 'id2'] } }} />,
      );

      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('ui-resource-carousel')).not.toBeInTheDocument();
    });

    it('should return null when resources not found', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'existing-id',
                  uri: 'ui://test/resource',
                  mimeType: 'text/html',
                  text: '<p>Resource content</p>',
                },
              ],
            },
          ],
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['non-existent-id'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should return null when no ui_resources attachments', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'web_search',
              web_search: { results: [] },
            },
          ],
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['id1', 'id2'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty resourceIds array', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'test-id',
                  uri: 'ui://test/resource',
                  mimeType: 'text/html',
                  text: '<p>Resource content</p>',
                },
              ],
            },
          ],
        },
      ];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: [] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle duplicate resource IDs', () => {
      currentTestMessages = [
        {
          messageId: 'msg123',
          attachments: [
            {
              type: 'ui_resources',
              ui_resources: [
                {
                  resourceId: 'id-a',
                  uri: 'ui://test/resource-a',
                  mimeType: 'text/html',
                  text: '<p>Resource A content</p>',
                },
                {
                  resourceId: 'id-b',
                  uri: 'ui://test/resource-b',
                  mimeType: 'text/html',
                  text: '<p>Resource B content</p>',
                },
              ],
            },
          ],
        },
      ];

      renderWithRecoil(
        <MCPUIResourceCarousel
          node={{ properties: { resourceIds: ['id-a', 'id-a', 'id-b', 'id-b', 'id-a'] } }}
        />,
      );

      const carousel = screen.getByTestId('ui-resource-carousel');
      expect(carousel).toHaveAttribute('data-resource-count', '5');

      const resources = screen.getAllByTestId(/resource-\d/);
      expect(resources).toHaveLength(5);
      expect(resources[0]).toHaveAttribute('data-resource-uri', 'ui://test/resource-a');
      expect(resources[1]).toHaveAttribute('data-resource-uri', 'ui://test/resource-a');
      expect(resources[2]).toHaveAttribute('data-resource-uri', 'ui://test/resource-b');
      expect(resources[3]).toHaveAttribute('data-resource-uri', 'ui://test/resource-b');
      expect(resources[4]).toHaveAttribute('data-resource-uri', 'ui://test/resource-a');
    });

    it('should handle null messages data', () => {
      currentTestMessages = [];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['test-id'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle missing conversation', () => {
      mockUseMessagesConversation.mockReturnValue({
        conversation: null,
        conversationId: null,
      } as any);
      currentTestMessages = [];

      const { container } = renderWithRecoil(
        <MCPUIResourceCarousel node={{ properties: { resourceIds: ['test-id'] } }} />,
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
