import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastContext } from '@librechat/client';
import type { LifeMapHouseAction } from 'librechat-data-provider';
import { useLifeMapHtmlQuery, useLifeMapHouseAnnotateMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import LifeFrame from './LifeFrame';

const HOUSE_ACTIONS: ReadonlySet<string> = new Set(['keep', 'rewrite', 'strike']);
const HOUSE_KEY = /^h([1-9]|1[0-2])$/;

const isHouseAction = (value: string): value is LifeMapHouseAction => HOUSE_ACTIONS.has(value);

export default function ArchiveMap() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const full = useLifeMapHtmlQuery('full');
  const simple = useLifeMapHtmlQuery(undefined, { enabled: full.isError });
  const annotate = useLifeMapHouseAnnotateMutation();

  const handleFrameMessage = useCallback(
    (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const message = data as {
        type?: unknown;
        payload?: { action?: unknown; houseId?: unknown; text?: unknown };
      };
      if (message.type !== 'life-map-action') return;
      const action = String(message.payload?.action ?? '');
      const houseKey = String(message.payload?.houseId ?? '');

      if (action === 'birth') {
        navigate('/resume');
        return;
      }
      if (action === 'dossier') {
        document
          .getElementById('archive-dossier')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (!isHouseAction(action) || !HOUSE_KEY.test(houseKey)) return;
      const text =
        typeof message.payload?.text === 'string' ? message.payload.text.trim() : undefined;
      if (action === 'rewrite' && !text) return;
      annotate.mutate(
        { houseKey, action, text },
        {
          onError: () => {
            showToast({ message: localize('com_life_dossier_annotate_failed'), status: 'error' });
            full.refetch();
          },
        },
      );
    },
    [annotate, full, localize, navigate, showToast],
  );

  const html = full.data ?? simple.data;
  const isLoading = full.isLoading || (full.isError && simple.isLoading);

  if (isLoading) {
    return (
      <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
        {localize('com_life_frame_loading')}
      </p>
    );
  }
  if (!html) {
    return (
      <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
        {localize('com_life_map_unavailable')}
        <button
          type="button"
          onClick={() => (full.isError ? simple.refetch() : full.refetch())}
          className="ml-3 min-h-11 underline underline-offset-4 hover:text-life-cinnabar"
        >
          {localize('com_life_retry')}
        </button>
      </p>
    );
  }

  return (
    <LifeFrame
      html={html}
      title={localize('com_life_map')}
      testId="life-map-frame"
      onFrameMessage={handleFrameMessage}
    />
  );
}
