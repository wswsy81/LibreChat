import { useState } from 'react';
import { useSubmitMessage } from '~/hooks';

export type LifeEntryOption = { id: string; text: string };

export type LifeEntryCard = {
  version: 1;
  entryHouse: string;
  options: LifeEntryOption[];
  escape: string;
};

export function parseLifeEntryCard(text: string): { text: string; card: LifeEntryCard | null } {
  const match = /<!--life-entry-options:([^\s>]+)-->/u.exec(text);
  if (!match) return { text, card: null };
  try {
    const decoded = JSON.parse(decodeURIComponent(match[1])) as Partial<LifeEntryCard>;
    const valid = decoded.version === 1
      && typeof decoded.entryHouse === 'string'
      && Array.isArray(decoded.options)
      && decoded.options.length === 3
      && decoded.options.every((option) => typeof option?.id === 'string' && typeof option?.text === 'string')
      && typeof decoded.escape === 'string';
    if (!valid) return { text, card: null };
    return { text: text.replace(match[0], '').trimEnd(), card: decoded as LifeEntryCard };
  } catch {
    return { text, card: null };
  }
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
            className="min-h-11 border border-border-medium bg-surface-secondary px-3 py-2 text-left text-sm text-text-primary transition-colors hover:border-border-heavy hover:bg-surface-tertiary disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            {option.text}
          </button>
        ))}
      </div>
      <p className="m-0 text-sm text-text-secondary">{card.escape}</p>
    </div>
  );
}
