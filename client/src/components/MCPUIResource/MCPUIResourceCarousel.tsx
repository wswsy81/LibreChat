import React, { useMemo } from 'react';
import type { UIResource } from 'librechat-data-provider';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import UIResourceCarousel from '../Chat/Messages/Content/UIResourceCarousel';
import { useMessageContext, useOptionalMessagesConversation } from '~/Providers';
import { shouldRenderUIResource } from './lifecycle';

interface MCPUIResourceCarouselProps {
  node: {
    properties: {
      resourceIds?: string[];
    };
  };
}

/** Renders multiple MCP UI resources in a carousel. Works in chat, share, and search views. */
export function MCPUIResourceCarousel(props: MCPUIResourceCarouselProps) {
  const { isLatestMessage } = useMessageContext();
  const { conversationId } = useOptionalMessagesConversation();

  const conversationResourceMap = useConversationUIResources(conversationId ?? undefined);

  const uiResources = useMemo(() => {
    const { resourceIds = [] } = props.node.properties;

    return resourceIds
      .map((id) => conversationResourceMap.get(id))
      .filter((resource): resource is UIResource => Boolean(resource))
      .filter((resource) => shouldRenderUIResource(resource, isLatestMessage));
  }, [props.node.properties, conversationResourceMap, isLatestMessage]);

  if (uiResources.length === 0) {
    return null;
  }

  return <UIResourceCarousel uiResources={uiResources} />;
}
