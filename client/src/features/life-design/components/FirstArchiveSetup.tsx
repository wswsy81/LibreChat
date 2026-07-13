import { useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LifeDashboards } from 'librechat-data-provider';
import { Button } from '@librechat/client';
import { useLifeDiagnosticMutation, useLifeOnboardingMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const fields = [
  { key: 'health', label: 'com_life_health', hint: 'com_life_health_hint' },
  { key: 'work', label: 'com_life_work', hint: 'com_life_work_hint' },
  { key: 'play', label: 'com_life_play', hint: 'com_life_play_hint' },
  { key: 'love', label: 'com_life_love', hint: 'com_life_love_hint' },
] as const;

const readError = (error: Error | null) => {
  const response = (error as Error & { response?: { data?: { error?: { message?: string } } } })
    ?.response;
  return response?.data?.error?.message || error?.message || '';
};

export default function FirstArchiveSetup({
  initialName,
  initialDashboards = {},
  diagnostic = false,
  onSaved,
}: {
  initialName: string;
  initialDashboards?: LifeDashboards;
  diagnostic?: boolean;
  onSaved?: () => void;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const onboarding = useLifeOnboardingMutation();
  const diagnostics = useLifeDiagnosticMutation();
  const [archiveName, setArchiveName] = useState(initialName);
  const [birthOptIn, setBirthOptIn] = useState(false);
  const [values, setValues] = useState<Required<LifeDashboards>>({
    health: initialDashboards.health ?? 5,
    work: initialDashboards.work ?? 5,
    play: initialDashboards.play ?? 5,
    love: initialDashboards.love ?? 5,
  });
  const [touched, setTouched] = useState<Set<keyof LifeDashboards>>(
    diagnostic ? new Set(fields.map((field) => field.key)) : new Set(),
  );

  const pending = onboarding.isLoading || diagnostics.isLoading;
  const error = readError(onboarding.error || diagnostics.error);
  const isNameValid =
    diagnostic || (archiveName.trim().length >= 3 && archiveName.trim().length <= 40);
  const isComplete = touched.size === fields.length && isNameValid;
  const lowest = useMemo(
    () => fields.reduce((best, field) => (values[field.key] < values[best.key] ? field : best)),
    [values],
  );

  const updateValue = (key: keyof LifeDashboards, value: number) => {
    setValues((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
  };

  const submit = () => {
    if (!isComplete || pending) {
      return;
    }
    if (diagnostic) {
      diagnostics.mutate({ dashboards: values }, { onSuccess: () => onSaved?.() });
      return;
    }
    onboarding.mutate(
      { archiveName: archiveName.trim(), dashboards: values, birthOptIn },
      { onSuccess: (result) => navigate(result.route, { replace: true }) },
    );
  };

  return (
    <section className="mx-auto w-full max-w-3xl" aria-labelledby="life-setup-title">
      <div className="mb-8">
        <p className="mb-3 text-sm font-medium tracking-[0.18em] text-amber-700 dark:text-amber-300">
          {localize(diagnostic ? 'com_life_recheck_eyebrow' : 'com_life_setup_eyebrow')}
        </p>
        <h1
          id="life-setup-title"
          className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl"
        >
          {localize(diagnostic ? 'com_life_recheck_title' : 'com_life_setup_title')}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary">
          {localize(diagnostic ? 'com_life_recheck_description' : 'com_life_setup_description')}
        </p>
      </div>

      <div className="space-y-6 rounded-[28px] border border-border-light bg-surface-primary p-5 shadow-sm sm:p-8">
        {!diagnostic && (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-primary">
              {localize('com_life_archive_name')}
            </span>
            <input
              value={archiveName}
              maxLength={40}
              onChange={(event) => setArchiveName(event.target.value)}
              className="h-12 w-full rounded-2xl border border-border-light bg-surface-secondary px-4 text-text-primary outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              aria-describedby="archive-name-help"
            />
            <span id="archive-name-help" className="mt-1.5 block text-xs text-text-secondary">
              {localize('com_life_archive_name_help')}
            </span>
          </label>
        )}

        <div className="space-y-5">
          {fields.map((field) => (
            <label key={field.key} className="block rounded-2xl bg-surface-secondary p-4">
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="block font-medium text-text-primary">
                    {localize(field.label)}
                  </span>
                  <span className="mt-1 block text-sm text-text-secondary">
                    {localize(field.hint)}
                  </span>
                </span>
                <output className="min-w-12 rounded-xl bg-surface-primary px-3 py-1.5 text-center font-semibold tabular-nums text-text-primary">
                  {values[field.key]}
                </output>
              </span>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={values[field.key]}
                onChange={(event) => updateValue(field.key, Number(event.target.value))}
                className="mt-4 h-3 w-full cursor-pointer accent-amber-600"
                aria-label={localize(field.label)}
              />
              <span className="mt-2 flex justify-between text-xs text-text-secondary">
                <span>{localize('com_life_bar_empty')}</span>
                <span>{localize('com_life_bar_full')}</span>
              </span>
            </label>
          ))}
        </div>

        {!diagnostic && (
          <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <input
              type="checkbox"
              checked={birthOptIn}
              onChange={(event) => setBirthOptIn(event.target.checked)}
              className="mt-1 h-5 w-5 rounded accent-amber-600"
            />
            <span>
              <span className="flex items-center gap-2 font-medium text-text-primary">
                <Sparkles className="h-4 w-4 text-amber-600" />
                {localize('com_life_birth_opt_in')}
              </span>
              <span className="mt-1 block text-sm leading-6 text-text-secondary">
                {localize('com_life_birth_opt_in_help')}
              </span>
            </span>
          </label>
        )}

        <div className="rounded-2xl bg-surface-secondary px-4 py-3 text-sm text-text-secondary">
          {touched.size === fields.length
            ? localize('com_life_lowest_bar', { 0: localize(lowest.label) })
            : localize('com_life_touch_all_bars')}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <Button
          type="button"
          disabled={!isComplete || pending}
          onClick={submit}
          className="min-h-12 w-full rounded-2xl bg-amber-600 text-white hover:bg-amber-700"
        >
          {pending
            ? localize('com_life_saving')
            : localize(diagnostic ? 'com_life_save_snapshot' : 'com_life_enter_studio')}
          {!pending && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}
