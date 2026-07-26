import { useCallback, useState } from 'react';
import type {
  LifeStanceFeedbackCurrent,
  LifeStanceFeedbackRequest,
  LifeStanceSelection,
} from 'librechat-data-provider';
import type { LifeStanceFeedbackVariables } from '~/data-provider/Life/mutations';
import type { StanceFeedbackMessage } from '../utils/stanceFeedback';
import { createIdempotencyKey, stanceFeedbackErrorOf } from '../utils/stanceFeedback';
import { useLifeStanceFeedbackMutation } from '~/data-provider';

export type StanceFeedbackStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface StanceFeedbackState {
  status: StanceFeedbackStatus;
  selection: LifeStanceSelection | null;
  retryable: boolean;
  submit: (message: StanceFeedbackMessage) => void;
  retry: () => void;
}

const attemptOf = (
  message: StanceFeedbackMessage,
  idempotencyKey: string,
): LifeStanceFeedbackVariables => ({
  reportId: message.reportId,
  payload: message.payload as LifeStanceFeedbackRequest,
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

  const send = useCallback(
    (variables: LifeStanceFeedbackVariables) => {
      setAttempt(variables);
      setStatus('saving');
      setSelection(variables.payload.selection);
      mutation.mutate(variables, {
        onSuccess: (result) => {
          setStatus('saved');
          setSelection(result.selection);
        },
        onError: (error) => {
          setStatus('failed');
          setRetryable(stanceFeedbackErrorOf(error).retryable);
        },
      });
    },
    [mutation],
  );

  const submit = useCallback(
    (message: StanceFeedbackMessage) => {
      // 再点一次同一个选项不是改选,不该多记一条历史;想改的人会点另一个。
      if (status === 'saved' && message.payload.selection === selection) return;
      setRetryable(true);
      send(attemptOf(message, createIdempotencyKey()));
    },
    [selection, send, status],
  );

  const retry = useCallback(() => {
    if (attempt) {
      send(attempt);
    }
  }, [attempt, send]);

  return { status, selection, retryable, submit, retry };
}
