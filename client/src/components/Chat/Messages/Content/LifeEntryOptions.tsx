import { useState } from 'react';
import { useLocalize, useSubmitMessage } from '~/hooks';

export type LifeEntryOption = { id: string; text: string };

export type LifeEntryCard = {
  version: 1;
  entryHouse: string;
  options: LifeEntryOption[];
  escape: string;
};

const ENTRY_OPTIONS_HEADER = '可以先选一句最像你的：';

function validCard(value: Partial<LifeEntryCard>): value is LifeEntryCard {
  return (
    value.version === 1 &&
    typeof value.entryHouse === 'string' &&
    Array.isArray(value.options) &&
    value.options.length === 3 &&
    value.options.every(
      (option) => typeof option?.id === 'string' && typeof option?.text === 'string',
    ) &&
    typeof value.escape === 'string'
  );
}

function parseReadableEntryOptions(text: string): { text: string; card: LifeEntryCard | null } {
  const match = new RegExp(
    `\\n{2}${ENTRY_OPTIONS_HEADER}\\n- ([^\\r\\n]+)\\n- ([^\\r\\n]+)\\n- ([^\\r\\n]+)\\n([^\\r\\n]+)\\s*$`,
    'u',
  ).exec(text);
  if (!match) return { text, card: null };
  const [, first, second, third, escape] = match;
  return {
    text: text.slice(0, match.index).trimEnd(),
    card: {
      version: 1,
      entryHouse: 'server-opening',
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

export default function LifeEntryOptions({ card }: { card: LifeEntryCard }) {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const submit = (id: string, text: string) => {
    if (selectedId || !text.trim()) return;
    setSelectedId(id);
    const submitted = submitMessage({ text: text.trim() });
    if (submitted === false) setSelectedId(null);
  };

  const select = (option: LifeEntryOption) => {
    submit(option.id, option.text);
  };

  return (
    <div className="mt-4 flex max-w-2xl flex-col gap-3" data-life-entry-house={card.entryHouse}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit('freeform', draft);
        }}
        className="border border-life-rule bg-life-paper p-4"
      >
        <label
          htmlFor={`life-entry-freeform-${card.entryHouse}`}
          className="font-life-serif text-life-body font-semibold text-life-ink"
        >
          {localize('com_life_entry_freeform_title')}
        </label>
        <textarea
          id={`life-entry-freeform-${card.entryHouse}`}
          value={draft}
          disabled={selectedId !== null}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={localize('com_life_entry_freeform_placeholder')}
          className="mt-3 min-h-36 w-full resize-y border border-life-rule bg-[#F7F4EB] px-4 py-3 font-life-kai text-base leading-7 text-life-ink outline-none placeholder:text-life-muted/75 focus:border-life-moss disabled:opacity-60"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={selectedId !== null || !draft.trim()}
            className="min-h-11 bg-life-moss px-5 text-sm font-semibold text-life-paper transition hover:bg-life-moss-deep disabled:cursor-default disabled:opacity-50"
          >
            {localize('com_life_entry_freeform_submit')}
          </button>
        </div>
      </form>

      <p className="m-0 font-life-kai text-sm leading-6 text-life-muted">
        {localize('com_life_entry_options_helper')}
      </p>
      <div
        className="grid gap-2 sm:grid-cols-3"
        aria-label={localize('com_life_entry_options_aria')}
      >
        {card.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={selectedId !== null}
            onClick={() => select(option)}
            className="min-h-11 border border-life-rule bg-[#F7F4EB] px-3 py-2 text-left text-sm text-life-muted transition-colors hover:border-life-brass hover:text-life-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-life-moss disabled:cursor-default disabled:opacity-60"
          >
            {option.text}
          </button>
        ))}
      </div>
      <p className="m-0 text-sm text-life-muted">{card.escape}</p>
    </div>
  );
}
