import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeContext, useMediaQuery } from '@librechat/client';
import {
  applyLifeReportTheme,
  reportHeightFromMessage,
  reportThemeIsDark,
} from '../utils/reportFrame';

export default function LifeFrame({
  html,
  title,
  testId,
  initialHeight = 640,
  onFrameMessage,
}: {
  html: string;
  title: string;
  testId?: string;
  initialHeight?: number;
  onFrameMessage?: (data: unknown) => void;
}) {
  const { theme } = useContext(ThemeContext);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = reportThemeIsDark(theme, systemDark);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(initialHeight);
  const messageRef = useRef(onFrameMessage);
  messageRef.current = onFrameMessage;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const nextHeight = reportHeightFromMessage(event.data);
      if (nextHeight) {
        setFrameHeight(nextHeight);
        return;
      }
      messageRef.current?.(event.data);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const themedHtml = useMemo(() => applyLifeReportTheme(html, dark), [dark, html]);

  return (
    <iframe
      ref={frameRef}
      data-testid={testId}
      title={title}
      sandbox="allow-scripts"
      srcDoc={themedHtml}
      style={{ height: frameHeight }}
      className="block w-full border-0 bg-transparent"
    />
  );
}
