import type { LifeStanceSelection } from 'librechat-data-provider';
import type { StanceFeedbackStatus as Status } from '../hooks/useStanceFeedback';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const SELECTION_KEYS: Record<LifeStanceSelection, TranslationKeys> = {
  more_direct: 'com_life_stance_more_direct',
  just_right: 'com_life_stance_just_right',
  less_direct: 'com_life_stance_less_direct',
};

export default function StanceFeedbackStatus({
  status,
  selection,
  retryable,
  onRetry,
}: {
  status: Status;
  selection: LifeStanceSelection | null;
  retryable: boolean;
  onRetry: () => void;
}) {
  const localize = useLocalize();
  if (status === 'idle') {
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
        {retryable
          ? localize('com_life_stance_feedback_failed')
          : localize('com_life_stance_feedback_stale')}
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
      {status === 'saving'
        ? localize('com_life_stance_feedback_saving')
        : localize('com_life_stance_feedback_saved', {
            0: localize(SELECTION_KEYS[selection ?? 'just_right']),
          })}
    </p>
  );
}
