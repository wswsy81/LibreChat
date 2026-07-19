import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

export { default as LifeLoading } from './LifeLoading';

export function LifeError({
  title,
  message,
  onRetry,
  onContinue,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  onContinue?: () => void;
}) {
  const localize = useLocalize();
  return (
    <main className="flex h-full min-h-96 items-center justify-center overflow-y-auto bg-surface-primary p-6">
      <div className="w-full max-w-lg rounded-[28px] border border-border-light bg-surface-primary p-7 text-center shadow-sm">
        <p className="text-life-meta font-medium tracking-[0.18em] text-life-cinnabar dark:text-[#D98A76]">
          {localize('com_life_archive_status')}
        </p>
        <h1 className="mt-3 text-life-title font-semibold text-text-primary">{title}</h1>
        <p className="mt-3 leading-7 text-text-secondary">{message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={onRetry}
            >
              {localize('com_life_retry')}
            </Button>
          )}
          {onContinue && (
            <Button
              type="button"
              className="min-h-11 rounded-xl bg-life-moss text-life-paper"
              onClick={onContinue}
            >
              {localize('com_life_continue_anyway')}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
