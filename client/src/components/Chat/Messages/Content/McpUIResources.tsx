import { UIResourceRenderer } from '@mcp-ui/client';
import { Tools, trySanitizeMCPUIResource } from 'librechat-data-provider';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import {
  useMessageContext,
  useOptionalMessagesConversation,
  useOptionalMessagesOperations,
} from '~/Providers';
import StanceFeedbackShell from '~/features/life-design/components/StanceFeedbackShell';
import useUIResourceAction from '~/components/MCPUIResource/useUIResourceAction';
import { shouldRenderUIResource } from '~/components/MCPUIResource/lifecycle';
import UIResourceCarousel from './UIResourceCarousel';

/**
 * 人生设计室:MCP(mingli)工具的"运行 X in Y"噪音卡在 Part.tsx 里被隐藏,
 * 但话题卡/生辰选择器等靠 postMessage 注入 prompt 的交互式 UI 资源是产品本体,
 * 不是噪音。这里只渲染工具自带的 UI 资源(去掉工具名/参数/输出等 chrome),
 * 并按 toolCallId 精确取本次调用的资源,避免同一轮多个 MCP 工具时重复渲染。
 */
export default function McpUIResources({
  attachments,
  toolCallId,
  inlineResourceIds,
}: {
  attachments?: TAttachment[];
  toolCallId?: string;
  /** 正文里 \ui{id} 标记已内联渲染的资源；这里跳过它们，同一张卡一条消息只出现一次。 */
  inlineResourceIds?: Set<string>;
}) {
  const { isLatestMessage } = useMessageContext();
  const { conversationId } = useOptionalMessagesConversation();
  const { ask } = useOptionalMessagesOperations();
  const onUIAction = useUIResourceAction({ ask, conversationId });

  const uiResources: UIResource[] = (
    attachments
      ?.filter(
        (attachment) =>
          attachment.type === Tools.ui_resources &&
          (!toolCallId || attachment.toolCallId === toolCallId),
      )
      .flatMap((attachment) => attachment[Tools.ui_resources] as UIResource[]) ?? []
  )
    .map(trySanitizeMCPUIResource)
    .filter((resource): resource is UIResource => Boolean(resource))
    .filter((resource) => !(resource.resourceId && inlineResourceIds?.has(resource.resourceId)))
    .filter((resource) => shouldRenderUIResource(resource, isLatestMessage));

  if (uiResources.length === 0) {
    return null;
  }

  // 内嵌报告的顾问力度反馈也走父壳:iframe 只 postMessage,联网与状态在这里。
  return (
    <StanceFeedbackShell className="w-full px-3 py-2">
      {uiResources.length > 1 ? (
        <UIResourceCarousel uiResources={uiResources} />
      ) : (
        <UIResourceRenderer
          resource={uiResources[0]}
          onUIAction={onUIAction}
          htmlProps={{ autoResizeIframe: { width: true, height: true } }}
        />
      )}
    </StanceFeedbackShell>
  );
}
