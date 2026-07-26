import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { LifeStanceFeedbackCurrent } from 'librechat-data-provider';
import { isFrameEventSource, stanceFeedbackFromMessage } from '../utils/stanceFeedback';
import useStanceFeedback from '../hooks/useStanceFeedback';
import StanceFeedbackStatus from './StanceFeedbackStatus';

/**
 * 顾问力度反馈的父壳:报告 iframe 只 postMessage,联网、幂等与状态都在这里。
 * 只处理本壳内 iframe 发来的 `life-reveal-stance-feedback`,其余协议原样交给别的 handler。
 */
export default function StanceFeedbackShell({
  children,
  reportId,
  initial,
  className,
}: {
  children: ReactNode;
  reportId?: string;
  initial?: LifeStanceFeedbackCurrent | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const feedback = useStanceFeedback(initial);
  const submitRef = useRef(feedback.submit);
  submitRef.current = feedback.submit;
  const reportIdRef = useRef(reportId);
  reportIdRef.current = reportId;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = stanceFeedbackFromMessage(event.data);
      if (!message) return;
      if (reportIdRef.current && message.reportId !== reportIdRef.current) return;
      if (!isFrameEventSource(containerRef.current, event.source)) return;
      submitRef.current(message);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {children}
      <StanceFeedbackStatus
        status={feedback.status}
        selection={feedback.selection}
        retryable={feedback.retryable}
        errorCode={feedback.errorCode}
        onRetry={feedback.retry}
      />
    </div>
  );
}
