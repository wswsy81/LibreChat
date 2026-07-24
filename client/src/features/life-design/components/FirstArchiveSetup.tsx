import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { LifeHouseId } from 'librechat-data-provider';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { track } from '~/utils/track';
import useHouseEntry from '../hooks/useEntry';
import { HOUSES, LifeWheel } from './LifeWheel';

const readError = (error: Error | null) => {
  const response = (error as Error & { response?: { data?: { error?: { message?: string } } } })
    ?.response;
  return response?.data?.error?.message || error?.message || '';
};

export default function FirstArchiveSetup({
  initialName,
  initialEntryHouse = null,
}: {
  initialName: string;
  initialEntryHouse?: LifeHouseId | null;
}) {
  const localize = useLocalize();
  const { enterHouse, error, isLoading } = useHouseEntry();
  const [archiveName, setArchiveName] = useState(initialName);
  const [selectedHouse, setSelectedHouse] = useState<LifeHouseId | null>(initialEntryHouse);
  const isNameValid = archiveName.trim().length >= 2 && archiveName.trim().length <= 40;
  const selectedName = HOUSES.find((house) => house.id === selectedHouse)?.publicName;
  const isComplete = isNameValid && selectedHouse != null;

  useEffect(() => {
    track('onboarding_view');
  }, []);

  const selectHouse = (entryHouse: LifeHouseId) => {
    setSelectedHouse(entryHouse);
    track('house_selected', { house: entryHouse });
  };

  const submit = () => {
    if (!isComplete || isLoading || !selectedHouse) {
      return;
    }
    track('onboarding_submit', { entryHouse: selectedHouse });
    enterHouse({ archiveName: archiveName.trim(), entryHouse: selectedHouse });
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
        <label className="block">
          <span className="mb-2 block text-life-sm font-medium text-life-ink">
            {localize('com_life_archive_name')}
          </span>
          <input
            value={archiveName}
            maxLength={40}
            onChange={(event) => setArchiveName(event.target.value)}
            aria-invalid={!isNameValid}
            className="h-12 w-full rounded-[4px] border border-life-rule bg-life-paper px-4 text-life-ink outline-none transition focus:border-life-moss focus:ring-2 focus:ring-life-moss/15"
            aria-describedby="archive-name-help"
          />
          <span id="archive-name-help" className="mt-2 block text-life-meta text-life-muted">
            {localize('com_life_archive_name_help')}
          </span>
        </label>

        <div className="mt-8 border-t border-life-rule pt-7">
          <div className="mb-5">
            <h2 className="font-life-serif text-life-lead font-semibold text-life-ink">
              {localize('com_life_choose_house')}
            </h2>
            <p className="mt-2 max-w-[34em] text-life-sm leading-7 text-life-muted">
              {localize('com_life_choose_house_help')}
            </p>
          </div>
          <LifeWheel
            mode="interactive"
            selectedHouse={selectedHouse}
            onSelectHouse={selectHouse}
            title={localize('com_life_wheel_select_aria')}
            className="mx-auto block w-full max-w-[520px]"
          />
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
