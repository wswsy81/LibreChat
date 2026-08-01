import React from 'react';
import { UIResourceRenderer } from '@mcp-ui/client';
import { sanitizeMCPUIResource } from 'librechat-data-provider';
import type { UIResource } from 'librechat-data-provider';
import {
  useMessageContext,
  useOptionalMessagesConversation,
  useOptionalMessagesOperations,
} from '~/Providers';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { shouldRenderUIResource } from './lifecycle';
import useUIResourceAction from './useUIResourceAction';
import { useLocalize } from '~/hooks';

interface MCPUIResourceProps {
  node: {
    properties: {
      resourceId: string;
    };
  };
}

/** Renders an MCP UI resource based on its resource ID. Works in chat, share, and search views. */
export function MCPUIResource(props: MCPUIResourceProps) {
  const { resourceId } = props.node.properties;
  const { isLatestMessage } = useMessageContext();
  const localize = useLocalize();
  const { conversationId } = useOptionalMessagesConversation();
  const { ask } = useOptionalMessagesOperations();
  const onUIAction = useUIResourceAction({ ask, conversationId });

  const conversationResourceMap = useConversationUIResources(conversationId ?? undefined);

  const uiResource = conversationResourceMap.get(resourceId ?? '');

  if (!uiResource) {
    return (
      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
        {localize('com_ui_ui_resource_not_found', {
          0: resourceId ?? '',
        })}
      </span>
    );
  }

  let safeResource: UIResource;
  try {
    safeResource = sanitizeMCPUIResource(uiResource);
  } catch (error) {
    console.error('Invalid MCP UI resource:', error);
    return (
      <span className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
        {localize('com_ui_ui_resource_error', { 0: resourceId })}
      </span>
    );
  }

  if (!shouldRenderUIResource(safeResource, isLatestMessage)) {
    return null;
  }

  try {
    return (
      <span className="mx-1 inline-block w-full align-middle">
        <UIResourceRenderer
          resource={safeResource}
          onUIAction={onUIAction}
          htmlProps={{
            autoResizeIframe: { width: true, height: true },
            sandboxPermissions: 'allow-popups',
          }}
        />
      </span>
    );
  } catch (error) {
    console.error('Error rendering UI resource:', error);
    return (
      <span className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
        {localize('com_ui_ui_resource_error', { 0: resourceId })}
      </span>
    );
  }
}
