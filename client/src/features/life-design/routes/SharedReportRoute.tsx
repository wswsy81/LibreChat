import { useParams } from 'react-router-dom';
import { useLifeShareQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { LifeError, LifeLoading } from '../components/PageState';

export default function SharedReportRoute() {
  const localize = useLocalize();
  const { shareToken = '' } = useParams();
  const share = useLifeShareQuery(shareToken);

  if (share.isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (share.isError || !share.data) {
    return (
      <LifeError
        title={localize('com_life_share_expired')}
        message={localize('com_life_share_expired_help')}
        onRetry={() => share.refetch()}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#eee8df] px-3 py-4 dark:bg-[#171512] sm:px-6 sm:py-7">
      <header className="mx-auto mb-4 flex w-full max-w-6xl items-end justify-between gap-5 rounded-2xl bg-white/75 px-5 py-4 shadow-sm backdrop-blur dark:bg-white/5 sm:rounded-3xl sm:px-7">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-amber-700 dark:text-amber-300">
            {localize('com_life_brand_eyebrow')}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[#211d18] dark:text-[#f5eee5] sm:text-2xl">
            {share.data.report.title}
          </h1>
        </div>
        <p className="hidden text-sm text-[#746a5d] dark:text-[#aaa094] sm:block">
          {localize('com_life_read_only_share')}
        </p>
      </header>
      <div className="mx-auto h-[calc(100dvh-8.5rem)] min-h-[620px] w-full max-w-6xl">
        <iframe
          data-testid="life-shared-report-frame"
          title={share.data.report.title}
          sandbox="allow-scripts"
          srcDoc={share.data.report.html}
          className="h-full w-full rounded-2xl border border-black/10 bg-white shadow-xl sm:rounded-3xl"
        />
      </div>
      <p className="mx-auto mt-4 max-w-6xl text-center text-xs text-[#746a5d] dark:text-[#aaa094]">
        {localize('com_life_shared_boundary')}
      </p>
    </main>
  );
}
