import { useNavigate } from 'react-router-dom';
import { Tools } from 'librechat-data-provider';
import { UIResourceRenderer } from '@mcp-ui/client';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import { useOptionalMessagesOperations } from '~/Providers';
import UIResourceCarousel from './UIResourceCarousel';
import { handleUIAction } from '~/utils';

/**
 * 人生设计室:MCP(mingli)工具的"运行 X in Y"噪音卡在 Part.tsx 里被隐藏,
 * 但话题卡/生辰选择器等靠 postMessage 注入 prompt 的交互式 UI 资源是产品本体,
 * 不是噪音。这里只渲染工具自带的 UI 资源(去掉工具名/参数/输出等 chrome),
 * 并按 toolCallId 精确取本次调用的资源,避免同一轮多个 MCP 工具时重复渲染。
 */
export default function McpUIResources({
  attachments,
  toolCallId,
}: {
  attachments?: TAttachment[];
  toolCallId?: string;
}) {
  const { ask } = useOptionalMessagesOperations();
  const navigate = useNavigate();

  // 沙箱 iframe(存档面板等)里的链接靠 postMessage {type:'link'} 上来:
  // 站内路径走 SPA 跳转,站外开新窗;其余动作(prompt/tool/intent)照旧交给 handleUIAction。
  const onUIAction = async (result: { type?: string; payload?: { url?: string } }) => {
    if (result?.type === 'link' && result.payload?.url) {
      const url = String(result.payload.url);
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (path.startsWith('/')) {
        navigate(path);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    return handleUIAction(result as Parameters<typeof handleUIAction>[0], ask);
  };

  const uiResources: UIResource[] =
    attachments
      ?.filter(
        (attachment) =>
          attachment.type === Tools.ui_resources &&
          (!toolCallId || attachment.toolCallId === toolCallId),
      )
      .flatMap((attachment) => attachment[Tools.ui_resources] as UIResource[]) ?? [];

  if (uiResources.length === 0) {
    return null;
  }

  return (
    <div className="w-full px-3 py-2">
      {uiResources.length > 1 ? (
        <UIResourceCarousel uiResources={uiResources} />
      ) : (
        <UIResourceRenderer
          resource={uiResources[0]}
          onUIAction={onUIAction}
          htmlProps={{ autoResizeIframe: { width: true, height: true } }}
        />
      )}
    </div>
  );
}
