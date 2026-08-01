import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LifeWheelView } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { track } from '~/utils/track';
import useHouseEntry from '../../hooks/useEntry';
import { formatLifeDate } from '../../utils/date';
import PublicMistMap, { PUBLIC_MAP_LABEL_KEYS } from '../PublicMistMap';
import type { ConditionLevel, HouseId, Recognition, Trend } from './contract';

const RECOGNITION_KEYS: Record<Recognition, TranslationKeys> = {
  unknown: 'com_life_recognition_unknown',
  draft: 'com_life_recognition_draft',
  owned: 'com_life_recognition_owned',
  dismissed: 'com_life_recognition_dismissed',
};

const CONDITION_KEYS: Record<ConditionLevel, TranslationKeys> = {
  unknown: 'com_life_condition_unknown',
  depleted: 'com_life_condition_depleted',
  strained: 'com_life_condition_strained',
  mixed: 'com_life_condition_mixed',
  steady: 'com_life_condition_steady',
  energizing: 'com_life_condition_energizing',
};

const TREND_KEYS: Record<Trend, TranslationKeys> = {
  unknown: 'com_life_trend_unknown',
  improving: 'com_life_trend_improving',
  stable: 'com_life_trend_stable',
  worsening: 'com_life_trend_worsening',
};

const readError = (error: Error | null) => {
  const response = (error as Error & { response?: { data?: { error?: { message?: string } } } })
    ?.response;
  return response?.data?.error?.message || error?.message || '';
};

const TREND_GLYPHS: Partial<Record<Trend, string>> = {
  improving: '↗',
  stable: '→',
  worsening: '↘',
};

export default function Explorer({
  wheel,
  archiveName,
}: {
  wheel?: LifeWheelView;
  archiveName: string;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { enterHouse, error, isLoading } = useHouseEntry();
  const [selectedHouse, setSelectedHouse] = useState<HouseId | null>(wheel?.lanternHouse ?? null);
  const selected = wheel?.houses.find((house) => house.id === selectedHouse);
  const selectedName = selectedHouse ? localize(PUBLIC_MAP_LABEL_KEYS[selectedHouse]) : undefined;

  const selectHouse = (entryHouse: HouseId) => {
    setSelectedHouse(entryHouse);
    track('house_selected', { house: entryHouse });
  };

  const start = () => {
    if (!selectedHouse || isLoading) {
      return;
    }
    if (selectedHouse === wheel?.lanternHouse) {
      navigate('/resume');
      return;
    }
    enterHouse({ archiveName, entryHouse: selectedHouse });
  };

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-center">
      <PublicMistMap selectedIsland={selectedHouse} onSelectIsland={selectHouse} />

      <div className="min-h-[250px] border border-life-rule bg-[#F7F4EB] p-5 sm:p-6">
        {selectedHouse && selectedName ? (
          <>
            <p className="font-life-mono text-life-meta tracking-[0.16em] text-life-cinnabar">
              {localize('com_life_house_detail')}
            </p>
            <h3 className="mt-3 font-life-serif text-life-title font-semibold text-life-ink">
              {selectedName}
            </h3>
            <dl className="mt-5 divide-y divide-life-rule border-y border-life-rule">
              <div className="grid grid-cols-[88px_1fr] gap-4 py-3">
                <dt className="font-life-mono text-life-meta text-life-muted">
                  {localize('com_life_recognition_label')}
                </dt>
                <dd className="text-life-sm text-life-ink">
                  {localize(RECOGNITION_KEYS[selected?.recognition ?? 'unknown'])}
                </dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-4 py-3">
                <dt className="font-life-mono text-life-meta text-life-muted">
                  {localize('com_life_condition_label')}
                </dt>
                <dd className="text-life-sm text-life-ink">
                  {localize(CONDITION_KEYS[selected?.condition.level ?? 'unknown'])}
                </dd>
              </div>
              <div className="grid grid-cols-[88px_1fr] gap-4 py-3">
                <dt className="font-life-mono text-life-meta text-life-muted">
                  {localize('com_life_trend_label')}
                </dt>
                <dd className="text-life-sm text-life-ink">
                  {TREND_GLYPHS[selected?.condition.trend ?? 'unknown'] ? (
                    <span aria-hidden="true" className="mr-1 text-life-muted">
                      {TREND_GLYPHS[selected?.condition.trend ?? 'unknown']}
                    </span>
                  ) : null}
                  {localize(TREND_KEYS[selected?.condition.trend ?? 'unknown'])}
                </dd>
              </div>
            </dl>
            {selected?.condition.asOf && (
              <p className="mt-4 font-life-mono text-life-meta text-life-muted">
                {localize('com_life_condition_as_of', {
                  0: formatLifeDate(selected.condition.asOf, { dateStyle: 'medium' }),
                })}
              </p>
            )}
            {selected?.condition.evidenceSummary && (
              <blockquote className="mt-4 border-l-2 border-life-brass pl-4 font-life-kai text-life-sm leading-7 text-life-ink">
                {selected.condition.evidenceSummary}
              </blockquote>
            )}
            <Button
              type="button"
              disabled={isLoading}
              onClick={start}
              className="mt-6 min-h-12 w-full rounded-[4px] bg-life-moss text-life-paper hover:bg-life-moss-deep"
            >
              {isLoading ? localize('com_life_preparing') : localize('com_life_enter_house')}
              {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </>
        ) : (
          <div className="flex min-h-[210px] flex-col justify-center">
            <p className="font-life-serif text-life-lead font-semibold text-life-ink">
              {localize('com_life_choose_house')}
            </p>
            <p className="mt-3 text-life-sm leading-7 text-life-muted">
              {localize('com_life_choose_house_return_help')}
            </p>
          </div>
        )}
        {readError(error) && (
          <p role="alert" className="mt-4 text-life-sm text-red-600">
            {readError(error)}
          </p>
        )}
      </div>
    </div>
  );
}
