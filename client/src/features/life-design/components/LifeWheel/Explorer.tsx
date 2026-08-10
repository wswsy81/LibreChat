import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@librechat/client';
import type { LifeDomainConversation, LifeWheelView } from 'librechat-data-provider';
import type { ConditionLevel, HouseId, HouseState, Recognition, Trend } from './contract';
import type { TranslationKeys } from '~/hooks';
import LifeWheel from './LifeWheel';
import { HOUSE_LABEL_KEYS } from './contract';
import { formatLifeDate } from '../../utils/date';
import useHouseEntry from '../../hooks/useEntry';
import { useLifeConditionCandidateResolveMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { track } from '~/utils/track';

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

function houseActionKey(
  hasExistingConversation: boolean,
  isCurrentHouse: boolean,
): TranslationKeys {
  if (!hasExistingConversation) {
    return 'com_life_start_house';
  }
  return isCurrentHouse ? 'com_life_continue_here' : 'com_life_return_to_house';
}

export default function Explorer({
  wheel,
  archiveName,
  domainConversations = [],
}: {
  wheel?: LifeWheelView;
  archiveName: string;
  domainConversations?: LifeDomainConversation[];
}) {
  const localize = useLocalize();
  const { enterHouse, error, isLoading } = useHouseEntry();
  const resolveCondition = useLifeConditionCandidateResolveMutation();
  const [selectedHouse, setSelectedHouse] = useState<HouseId | null>(wheel?.lanternHouse ?? null);
  const [correctedLevel, setCorrectedLevel] = useState<Exclude<ConditionLevel, 'unknown'>>('mixed');
  const selected = wheel?.houses.find((house) => house.id === selectedHouse);
  const selectedName = selectedHouse ? localize(HOUSE_LABEL_KEYS[selectedHouse]) : undefined;
  const houseStates = wheel?.houses.reduce<Partial<Record<HouseId, HouseState>>>(
    (states, house) => {
      states[house.id] = {
        recognition: house.recognition,
        conditionLevel: house.condition.level,
        trend: house.condition.trend,
      };
      return states;
    },
    {},
  );
  const selectedConversation = domainConversations.find(
    (conversation) => conversation.entryHouse === selectedHouse,
  );
  const activeLink = selected?.activeLinks?.[0] || null;
  const pendingCondition = selected?.pendingCondition || null;
  const linkedHouses = (wheel?.houses || [])
    .filter((house) => (house.activeLinks?.length || 0) > 0)
    .map((house) => house.id as HouseId);

  useEffect(() => {
    if (pendingCondition?.level) setCorrectedLevel(pendingCondition.level);
  }, [pendingCondition?.candidateId, pendingCondition?.level]);

  const selectHouse = (entryHouse: HouseId) => {
    setSelectedHouse(entryHouse);
    track('house_selected', { house: entryHouse });
  };

  const start = () => {
    if (!selectedHouse || isLoading) {
      return;
    }
    enterHouse({ archiveName, entryHouse: selectedHouse });
  };

  const resolvePending = (action: 'confirm' | 'correct') => {
    if (!pendingCondition || !activeLink || resolveCondition.isLoading) return;
    resolveCondition.mutate({
      conversationId: activeLink.conversationId,
      candidateId: pendingCondition.candidateId,
      action,
      ...(action === 'correct' ? { level: correctedLevel } : {}),
    });
  };

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-center">
      <div className="border border-life-ink/45 bg-[#F7F4EB] p-2 shadow-[0_18px_70px_rgba(23,32,26,0.08)] dark:border-white/20 sm:p-5">
        <LifeWheel
          mode="interactive"
          houseStates={houseStates}
          lanternHouse={wheel?.lanternHouse ?? null}
          selectedHouse={selectedHouse}
          linkedHouses={linkedHouses}
          onSelectHouse={selectHouse}
          className="mx-auto block w-full max-w-[560px]"
        />
      </div>

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
            {activeLink && (
              <div className="mt-5 border-l-2 border-life-moss pl-4">
                <p className="font-life-mono text-life-meta tracking-[0.12em] text-life-moss">
                  {localize('com_life_related_thread')}
                </p>
                <p className="mt-2 font-life-kai text-life-sm leading-7 text-life-ink">
                  {activeLink.title}
                </p>
              </div>
            )}
            {pendingCondition && (
              <div className="mt-5 border border-life-brass/50 bg-life-brass/5 p-4">
                <p className="font-life-mono text-life-meta tracking-[0.12em] text-life-brass">
                  {localize('com_life_condition_pending_title')}
                </p>
                <p className="mt-2 font-life-kai text-life-sm leading-7 text-life-ink">
                  {pendingCondition.statement}
                </p>
                {pendingCondition.evidenceSummary && (
                  <blockquote className="mt-3 border-l-2 border-life-rule pl-3 font-life-kai text-life-sm leading-7 text-life-muted">
                    {pendingCondition.evidenceSummary}
                  </blockquote>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {pendingCondition.level && (
                    <button
                      type="button"
                      disabled={resolveCondition.isLoading}
                      onClick={() => resolvePending('confirm')}
                      className="min-h-10 border border-life-moss px-4 font-life-sans text-life-sm text-life-moss hover:bg-life-moss hover:text-life-paper disabled:opacity-50"
                    >
                      {localize('com_life_condition_confirm')}
                    </button>
                  )}
                  <select
                    value={correctedLevel}
                    onChange={(event) =>
                      setCorrectedLevel(event.target.value as Exclude<ConditionLevel, 'unknown'>)
                    }
                    className="min-h-10 border border-life-rule bg-life-paper px-3 font-life-sans text-life-sm text-life-ink"
                    aria-label={localize('com_life_condition_correct_label')}
                  >
                    {(['depleted', 'strained', 'mixed', 'steady', 'energizing'] as const).map(
                      (level) => (
                        <option key={level} value={level}>
                          {localize(CONDITION_KEYS[level])}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    type="button"
                    disabled={resolveCondition.isLoading}
                    onClick={() => resolvePending('correct')}
                    className="min-h-10 border-b border-life-brass font-life-sans text-life-sm text-life-brass hover:text-life-ink disabled:opacity-50"
                  >
                    {localize('com_life_condition_correct')}
                  </button>
                </div>
              </div>
            )}
            <Button
              type="button"
              disabled={isLoading}
              onClick={start}
              className="mt-6 min-h-12 w-full rounded-[4px] bg-life-moss text-life-paper hover:bg-life-moss-deep"
            >
              {isLoading
                ? localize('com_life_preparing')
                : localize(
                    houseActionKey(
                      selectedConversation != null,
                      selectedHouse === wheel?.lanternHouse,
                    ),
                  )}
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
