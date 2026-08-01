import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UIActionResult } from '@mcp-ui/client';
import { Constants } from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import { handleUIAction } from '~/utils';

export const CHAPTER_CONTINUE_PROMPT = [
  '[trigger:chapter_continue] ',
  String.fromCodePoint(0x7ee7, 0x7eed),
  ',',
  String.fromCodePoint(0x8fdb, 0x5165, 0x4e0b, 0x4e00, 0x7ae0, 0x3002),
].join('');

export function legacyChapterContinuation(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.pathname !== '/c/new') {
      return null;
    }
    const prompt = parsed.searchParams.get('prompt') || parsed.searchParams.get('q');
    const submit = parsed.searchParams.get('submit');
    return prompt === CHAPTER_CONTINUE_PROMPT && submit?.toLowerCase() === 'true' ? prompt : null;
  } catch {
    return null;
  }
}

export default function useUIResourceAction({
  ask,
  conversationId,
}: {
  ask: TAskFunction;
  conversationId?: string | null;
}) {
  const navigate = useNavigate();

  return useCallback(
    async (result: UIActionResult) => {
      if (result.type !== 'link') {
        return handleUIAction(result, ask);
      }

      const url = String(result.payload.url);
      const continuation = legacyChapterContinuation(url);
      if (continuation && conversationId && conversationId !== Constants.NEW_CONVO) {
        ask({ text: continuation });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(url, window.location.href);
      } catch {
        return;
      }

      if (parsed.origin === window.location.origin) {
        navigate(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        return;
      }

      window.open(parsed.href, '_blank', 'noopener,noreferrer');
    },
    [ask, conversationId, navigate],
  );
}
