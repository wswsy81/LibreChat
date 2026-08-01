import { useId, useState } from 'react';
import type { HouseId } from '~/features/life-design/components/LifeWheel/contract';
import { HOUSE_LABEL_KEYS } from '~/features/life-design/components/LifeWheel/contract';
import { useChatFormContext, useMessageContext } from '~/Providers';
import { mainTextareaId } from '~/common';
import { useLocalize } from '~/hooks';

export type LifeEntryOption = { id: string; text: string };

export type LifeEntryCard = {
  version: 1;
  entryHouse: string;
  areaLabel?: string;
  options: LifeEntryOption[];
  escape: string;
};

const HOUSE_IDS = new Set<HouseId>(Object.keys(HOUSE_LABEL_KEYS) as HouseId[]);

function isHouseId(value: string): value is HouseId {
  return HOUSE_IDS.has(value as HouseId);
}

function validCard(value: Partial<LifeEntryCard>): value is LifeEntryCard {
  return (
    value.version === 1 &&
    typeof value.entryHouse === 'string' &&
    (value.areaLabel == null || typeof value.areaLabel === 'string') &&
    Array.isArray(value.options) &&
    value.options.length === 3 &&
    value.options.every(
      (option) => typeof option?.id === 'string' && typeof option?.text === 'string',
    ) &&
    typeof value.escape === 'string'
  );
}

function parseReadableEntryOptions(text: string): { text: string; card: LifeEntryCard | null } {
  const match =
    /(?:\r?\n){2}((?!-\s)[^\r\n]+)\r?\n- ([^\r\n]+)\r?\n- ([^\r\n]+)\r?\n- ([^\r\n]+)\r?\n([^\r\n]+)\s*$/u.exec(
      text,
    );
  if (!match) return { text, card: null };
  const [, heading, first, second, third, escape] = match;
  const areaLabel = heading.includes('·') ? heading.split('·', 1)[0].trim() : undefined;
  return {
    text: text.slice(0, match.index).trimEnd(),
    card: {
      version: 1,
      entryHouse: 'server-opening',
      ...(areaLabel ? { areaLabel } : {}),
      options: [first, second, third].map((option, index) => ({
        id: `server-opening-${index + 1}`,
        text: option,
      })),
      escape,
    },
  };
}

export function parseLifeEntryCard(text: string): { text: string; card: LifeEntryCard | null } {
  const match = /<!--life-entry-options:([^\s>]+)-->/u.exec(text);
  if (match) {
    try {
      const decoded = JSON.parse(decodeURIComponent(match[1])) as Partial<LifeEntryCard>;
      if (validCard(decoded)) return { text: text.replace(match[0], '').trimEnd(), card: decoded };
    } catch {
      // Fall through to the human-readable protocol below.
    }
  }
  return parseReadableEntryOptions(text);
}

function focusComposer() {
  document.getElementById(mainTextareaId)?.focus();
}

export default function LifeEntryOptions({
  card,
  prompt,
}: {
  card: LifeEntryCard;
  prompt: string;
}) {
  const localize = useLocalize();
  const methods = useChatFormContext();
  const { isLatestMessage } = useMessageContext();
  const headingId = useId();
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showSuggestion, setShowSuggestion] = useState(true);
  const suggestion = card.options[suggestionIndex];
  const houseLabel =
    card.areaLabel ??
    (isHouseId(card.entryHouse)
      ? localize(HOUSE_LABEL_KEYS[card.entryHouse])
      : localize('com_life_entry_area_fallback'));

  const fillSuggestion = () => {
    methods.setValue('text', suggestion.text, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    focusComposer();
  };

  const showNextSuggestion = () => {
    setSuggestionIndex((current) => (current + 1) % card.options.length);
  };

  const writeMyOwn = () => {
    setShowSuggestion(false);
    focusComposer();
  };

  return (
    <section
      className="my-4 w-full max-w-2xl border-y border-life-rule py-5"
      data-life-entry-house={card.entryHouse}
      aria-labelledby={headingId}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 font-life-mono text-life-meta uppercase tracking-[0.08em] text-life-muted">
        <span id={headingId} className="font-semibold text-life-brass">
          {houseLabel}
        </span>
        <span aria-hidden="true">·</span>
        <span>{localize('com_life_entry_recent_days')}</span>
      </header>

      <p className="mt-3 max-w-[34em] whitespace-pre-line font-life-kai text-life-lead text-life-ink">
        {prompt}
      </p>

      {isLatestMessage !== false && (
        <div className="mt-5 border-l-2 border-life-cinnabar pl-4">
          {showSuggestion ? (
            <>
              <p className="m-0 text-life-sm text-life-muted">
                {localize('com_life_entry_options_helper')}
              </p>
              <button
                type="button"
                onClick={fillSuggestion}
                className="mt-2 min-h-11 w-full max-w-[34em] border-0 bg-transparent p-0 text-left font-life-kai text-life-body text-life-ink underline decoration-life-rule underline-offset-4 transition-colors hover:decoration-life-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-life-moss"
                aria-label={localize('com_life_entry_suggestion_use', { 0: suggestion.text })}
              >
                {localize('com_life_entry_suggestion_quote', { 0: suggestion.text })}
              </button>
              <p className="mt-2 text-life-meta text-life-muted">
                {localize('com_life_entry_suggestion_note')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={showNextSuggestion}
                  className="min-h-11 border border-life-rule bg-life-paper px-4 text-life-sm font-semibold text-life-muted transition-colors hover:border-life-brass hover:text-life-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-life-moss"
                >
                  {localize('com_life_entry_suggestion_refresh')}
                </button>
                <button
                  type="button"
                  onClick={writeMyOwn}
                  className="min-h-11 border border-transparent bg-transparent px-2 text-life-sm text-life-muted underline decoration-life-rule underline-offset-4 hover:text-life-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-life-moss"
                >
                  {localize('com_life_entry_suggestion_dismiss')}
                </button>
              </div>
              <p className="mt-3 text-life-sm text-life-muted">{card.escape}</p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowSuggestion(true)}
              className="min-h-11 border border-transparent bg-transparent px-0 text-life-sm text-life-muted underline decoration-life-rule underline-offset-4 hover:text-life-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-life-moss"
            >
              {localize('com_life_entry_suggestion_reopen')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
