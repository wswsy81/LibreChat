import { useCallback, useRef, useState } from 'react';
import type { LifeStanceFeedbackCurrent, LifeStanceSelection } from 'librechat-data-provider';
import type { LifeStanceFeedbackVariables } from '~/data-provider/Life/mutations';
import type { StanceFeedbackMessage } from '../utils/stanceFeedback';
import { createIdempotencyKey, stanceFeedbackErrorOf } from '../utils/stanceFeedback';
import { useLifeStanceFeedbackMutation } from '~/data-provider';

export type StanceFeedbackStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface StanceFeedbackState {
  status: StanceFeedbackStatus;
  selection: LifeStanceSelection | null;
  retryable: boolean;
  errorCode: string | null;
  submit: (message: StanceFeedbackMessage) => void;
  retry: () => void;
}

const attemptOf = (
  message: StanceFeedbackMessage,
  idempotencyKey: string,
): LifeStanceFeedbackVariables => ({
  reportId: message.reportId,
  payload: message.payload,
  idempotencyKey,
});

/**
 * 首版只记录反馈:不改当前报告、不触发重跑、不写 stancePreference。
 * 报告 iframe 没有回执 handler,提交中/已记下/失败重试全部由父壳呈现。
 */
export default function useStanceFeedback(
  initial?: LifeStanceFeedbackCurrent | null,
): StanceFeedbackState {
  const mutation = useLifeStanceFeedbackMutation();
  const [attempt, setAttempt] = useState<LifeStanceFeedbackVariables | null>(null);
  const [status, setStatus] = useState<StanceFeedbackStatus>(initial ? 'saved' : 'idle');
  const [selection, setSelection] = useState<LifeStanceSelection | null>(
    initial?.selection ?? null,
  );
  const [retryable, setRetryable] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  /** 连点两次会有两个请求在飞;先发的后回来时不能把后发的结果盖掉。 */
  const latestKeyRef = useRef<string | null>(null);

  const send = useCallback(
    (variables: LifeStanceFeedbackVariables) => {
      const isLatest = () => latestKeyRef.current === variables.idempotencyKey;
      latestKeyRef.current = variables.idempotencyKey;
      setAttempt(variables);
      setStatus('saving');
      setSelection(variables.payload.selection);
      mutation.mutate(variables, {
        onSuccess: (result) => {
          if (!isLatest()) return;
          setStatus('saved');
          setSelection(result.selection);
        },
        onError: (error) => {
          if (!isLatest()) return;
          const failure = stanceFeedbackErrorOf(error);
          setStatus('failed');
          setRetryable(failure.retryable);
          setErrorCode(failure.code);
        },
      });
    },
    [mutation],
  );

  const submit = useCallback(
    (message: StanceFeedbackMessage) => {
      // 再点一次同一个选项不是改选,不该多记一条历史;想改的人会点另一个。
      if (status === 'saved' && message.payload.selection === selection) return;
      // 失败后点回同一个选项就是重试:必须复用原 key,否则上一发其实写成功了就会记两条。
      if (status === 'failed' && attempt && message.payload.selection === selection) {
        send(attempt);
        return;
      }
      setRetryable(true);
      setErrorCode(null);
      send(attemptOf(message, createIdempotencyKey()));
    },
    [attempt, selection, send, status],
  );

  const retry = useCallback(() => {
    if (attempt) {
      send(attempt);
    }
  }, [attempt, send]);

  return { status, selection, retryable, errorCode, submit, retry };
}
