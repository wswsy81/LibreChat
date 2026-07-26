import type { LifeStanceSelection } from 'librechat-data-provider';
import type { StanceFeedbackStatus as Status } from '../hooks/useStanceFeedback';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const SELECTION_KEYS: Record<LifeStanceSelection, TranslationKeys> = {
  more_direct: 'com_life_stance_more_direct',
  just_right: 'com_life_stance_just_right',
  less_direct: 'com_life_stance_less_direct',
};

/** 只有这两个码是"报告已经变了",其余不可重试的失败不能冒充成版本问题。 */
const STALE_CODES = new Set(['REPORT_VERSION_MISMATCH', 'STANCE_METADATA_MISMATCH']);

const failureKey = (retryable: boolean, errorCode: string | null): TranslationKeys => {
  if (retryable) return 'com_life_stance_feedback_failed';
  return STALE_CODES.has(errorCode ?? '')
    ? 'com_life_stance_feedback_stale'
    : 'com_life_stance_feedback_rejected';
};

export default function StanceFeedbackStatus({
  status,
  selection,
  retryable,
  errorCode,
  onRetry,
}: {
  status: Status;
  selection: LifeStanceSelection | null;
  retryable: boolean;
  errorCode: string | null;
  onRetry: () => void;
}) {
  const localize = useLocalize();
  if (status === 'idle' || (status === 'saved' && !selection)) {
    return null;
  }

  const line = 'mt-3 font-life-sans text-life-sm leading-7';

  if (status === 'failed') {
    return (
      <p
        role="alert"
        data-testid="life-stance-feedback-status"
        className={`${line} text-life-cinnabar dark:text-[#D98A76]`}
      >
        {localize(failureKey(retryable, errorCode))}
        {retryable && (
          <button
            type="button"
            data-testid="life-stance-feedback-retry"
            onClick={onRetry}
            className="ml-3 min-h-11 underline underline-offset-4 hover:text-life-ink dark:hover:text-gray-100"
          >
            {localize('com_life_retry')}
          </button>
        )}
      </p>
    );
  }

  return (
    <p
      aria-live="polite"
      data-testid="life-stance-feedback-status"
      className={`${line} text-life-muted dark:text-gray-400`}
    >
      {status === 'saving' || !selection
        ? localize('com_life_stance_feedback_saving')
        : localize('com_life_stance_feedback_saved', { 0: localize(SELECTION_KEYS[selection]) })}
    </p>
  );
}
