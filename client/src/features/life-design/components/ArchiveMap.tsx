import { useLifeMapHtmlQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import LifeFrame from './LifeFrame';

export default function ArchiveMap() {
  const localize = useLocalize();
  const html = useLifeMapHtmlQuery();

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
        {localize('com_life_map_unavailable')}
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

  return <LifeFrame html={html.data} title={localize('com_life_map')} testId="life-map-frame" />;
}
