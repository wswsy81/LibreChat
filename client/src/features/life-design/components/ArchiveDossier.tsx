import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import type { LifeDossierAction, LifeDossierSection } from 'librechat-data-provider';
import { useLifeDossierAnnotateMutation, useLifeDossierHtmlQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import LifeFrame from './LifeFrame';

const SECTIONS: ReadonlySet<string> = new Set([
  'chapters',
  'scenes',
  'traits',
  'tensions',
  'language',
]);
const ACTIONS: ReadonlySet<string> = new Set(['keep', 'rewrite', 'strike']);

const isSection = (value: string): value is LifeDossierSection => SECTIONS.has(value);
const isAction = (value: string): value is LifeDossierAction => ACTIONS.has(value);

export default function ArchiveDossier() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const html = useLifeDossierHtmlQuery(true);
  const annotate = useLifeDossierAnnotateMutation();

  const handleFrameMessage = useCallback(
    (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const message = data as { type?: unknown; payload?: { target?: unknown; action?: unknown } };
      if (message.type !== 'life-annotate') return;
      const target = String(message.payload?.target ?? '');
      const action = String(message.payload?.action ?? '');
      const [section = '', entryId = ''] = target.split('#');
      if (!isSection(section) || !isAction(action) || !entryId) return;

      let text: string | undefined;
      if (action === 'rewrite') {
        const input = window.prompt(localize('com_life_dossier_rewrite_prompt'));
        if (input == null || !input.trim()) return;
        text = input.trim();
      }
      annotate.mutate(
        { section, entryId, action, text },
        {
          onError: () =>
            showToast({ message: localize('com_life_dossier_annotate_failed'), status: 'error' }),
        },
      );
    },
    [annotate, localize, showToast],
  );

  if (html.isLoading) {
    return (
      <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
        {localize('com_life_frame_loading')}
      </p>
    );
  }
  if (html.isError || !html.data) {
    return (
      <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
        {localize('com_life_dossier_unavailable')}
        <button
          type="button"
          onClick={() => html.refetch()}
          className="ml-3 min-h-11 underline underline-offset-4 hover:text-life-cinnabar"
        >
          {localize('com_life_retry')}
        </button>
      </p>
    );
  }

  return (
    <LifeFrame
      html={html.data}
      title={localize('com_life_dossier')}
      testId="life-dossier-frame"
      onFrameMessage={handleFrameMessage}
    />
  );
}
