import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { LifeHouseId } from 'librechat-data-provider';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { track } from '~/utils/track';
import useHouseEntry from '../hooks/useEntry';
import PublicMistMap, { ACTIVE_PUBLIC_HOUSES, PUBLIC_MAP_LABEL_KEYS } from './PublicMistMap';

const PROMISE_LINE_KEYS = [
  'com_life_setup_promise_1',
  'com_life_setup_promise_2',
  'com_life_setup_promise_3',
  'com_life_setup_promise_4',
  'com_life_setup_promise_5',
] as const;

const EXAMPLE_LINE_CARDS = [
  { titleKey: 'com_life_line_inertia', bodyKey: 'com_life_setup_line_inertia_help' },
  { titleKey: 'com_life_line_intervention', bodyKey: 'com_life_setup_line_intervention_help' },
  { titleKey: 'com_life_line_rupture', bodyKey: 'com_life_setup_line_rupture_help' },
] as const;

const readError = (error: Error | null) => {
  const response = (error as Error & { response?: { data?: { error?: { message?: string } } } })
    ?.response;
  return response?.data?.error?.message || error?.message || '';
};

const padTimestampPart = (value: number) => String(value).padStart(2, '0');

export const createAutomaticArchiveName = (houseName: string, now = new Date()) =>
  `${houseName} · ${now.getFullYear()}-${padTimestampPart(now.getMonth() + 1)}-${padTimestampPart(now.getDate())} ${padTimestampPart(now.getHours())}:${padTimestampPart(now.getMinutes())}`;

export default function FirstArchiveSetup({
  initialEntryHouse = null,
}: {
  initialEntryHouse?: LifeHouseId | null;
}) {
  const localize = useLocalize();
  const { enterHouse, error, isLoading } = useHouseEntry();
  const [selectedHouse, setSelectedHouse] = useState<LifeHouseId | null>(
    initialEntryHouse && ACTIVE_PUBLIC_HOUSES.has(initialEntryHouse) ? initialEntryHouse : null,
  );
  const selectedName = selectedHouse ? localize(PUBLIC_MAP_LABEL_KEYS[selectedHouse]) : undefined;
  const isComplete = selectedHouse != null && selectedName != null;

  useEffect(() => {
    track('onboarding_view');
  }, []);

  const selectHouse = (entryHouse: LifeHouseId) => {
    setSelectedHouse(entryHouse);
    track('house_selected', { house: entryHouse });
  };

  const submit = () => {
    if (!isComplete || isLoading || !selectedHouse || !selectedName) {
      return;
    }
    track('onboarding_submit', { entryHouse: selectedHouse });
    enterHouse({
      archiveName: createAutomaticArchiveName(selectedName),
      entryHouse: selectedHouse,
    });
  };

  return (
    <section className="mx-auto w-full max-w-4xl" aria-labelledby="life-setup-title">
      <div className="mb-8">
        <p className="mb-3 flex items-baseline justify-between gap-4 border-b border-life-ink/20 pb-3 font-life-mono text-life-meta tracking-[0.16em] text-life-cinnabar">
          <span>{localize('com_life_setup_chapter_kicker')}</span>
          <span className="text-life-muted">{localize('com_life_setup_chapter_number')}</span>
        </p>
        <p className="mb-3 text-life-sm font-medium tracking-[0.18em] text-life-cinnabar">
          {localize('com_life_setup_eyebrow')}
        </p>
        <h1
          id="life-setup-title"
          className="font-life-serif text-life-title font-semibold tracking-tight text-life-ink sm:text-life-display"
        >
          {localize('com_life_setup_title')}
        </h1>
        <p className="mt-3 max-w-[34em] text-life-body leading-8 text-life-muted">
          {localize('com_life_setup_description')}
        </p>
      </div>

      <div className="border border-life-rule bg-[#F7F4EB] p-5 sm:p-8">
        <div className="mb-7 border-l-2 border-life-cinnabar pl-4 sm:pl-5">
          <h2 className="font-life-serif text-life-lead font-semibold text-life-ink">
            {localize('com_life_setup_promise_title')}
          </h2>
          <ol className="mt-3 space-y-2 font-life-kai text-life-sm leading-7 text-life-muted">
            {PROMISE_LINE_KEYS.map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="font-life-mono text-life-meta text-life-brass">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{localize(key)}</span>
              </li>
            ))}
          </ol>
        </div>
        <section className="mb-7" aria-labelledby="life-setup-lines-title">
          <h2
            id="life-setup-lines-title"
            className="font-life-serif text-life-lead font-semibold text-life-ink"
          >
            {localize('com_life_setup_lines_title')}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {EXAMPLE_LINE_CARDS.map((card, index) => (
              <article key={card.titleKey} className="border border-life-rule bg-life-paper p-4">
                <p className="font-life-mono text-life-meta text-life-cinnabar">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-2 font-life-serif text-life-body font-semibold text-life-ink">
                  {localize(card.titleKey)}
                </h3>
                <p className="mt-2 font-life-kai text-life-sm leading-7 text-life-muted">
                  {localize(card.bodyKey)}
                </p>
              </article>
            ))}
          </div>
        </section>
        <div>
          <div className="mb-5">
            <h2 className="font-life-serif text-life-lead font-semibold text-life-ink">
              {localize('com_life_choose_house')}
            </h2>
            <p className="mt-2 max-w-[34em] text-life-sm leading-7 text-life-muted">
              {localize('com_life_choose_house_help')}
            </p>
          </div>
          <PublicMistMap selectedIsland={selectedHouse} onSelectIsland={selectHouse} />
          <p
            className="mt-4 min-h-6 text-center font-life-mono text-life-meta text-life-brass"
            aria-live="polite"
          >
            {selectedName
              ? localize('com_life_house_selected', { 0: selectedName })
              : localize('com_life_house_not_selected')}
          </p>
        </div>

        {readError(error) && (
          <p role="alert" className="mt-5 text-life-sm text-red-600">
            {readError(error)}
          </p>
        )}

        <Button
          type="button"
          disabled={!isComplete || isLoading}
          onClick={submit}
          className="mt-6 min-h-12 w-full rounded-[4px] bg-life-moss text-life-paper hover:bg-life-moss-deep"
        >
          {isLoading ? localize('com_life_saving') : localize('com_life_enter_studio')}
          {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}
