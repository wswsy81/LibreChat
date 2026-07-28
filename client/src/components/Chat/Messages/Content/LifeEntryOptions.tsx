import { useState } from 'react';
import { useSubmitMessage } from '~/hooks';

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
  const { submitMessage } = useSubmitMessage();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const select = (option: LifeEntryOption) => {
    if (selectedId) return;
    setSelectedId(option.id);
    const submitted = submitMessage({ text: option.text });
    if (submitted === false) setSelectedId(null);
  };

  return (
    <div className="mt-3 flex max-w-xl flex-col gap-2" data-life-entry-house={card.entryHouse}>
      <div className="grid gap-2 sm:grid-cols-3">
        {card.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={selectedId !== null}
            onClick={() => select(option)}
            className="min-h-11 border border-border-medium bg-surface-secondary px-3 py-2 text-left text-sm text-text-primary transition-colors hover:border-border-heavy hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary disabled:cursor-default disabled:opacity-60"
          >
            {option.text}
          </button>
        ))}
      </div>
      <p className="m-0 text-sm text-text-secondary">{card.escape}</p>
    </div>
  );
}
