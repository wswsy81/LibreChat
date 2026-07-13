import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useLifeReportHtmlQuery, useLifeReportQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import ReportActions from '../components/ReportActions';
import { LifeError, LifeLoading } from '../components/PageState';

export default function ReportRoute() {
  const localize = useLocalize();
  const { reportId = '' } = useParams();
  const report = useLifeReportQuery(reportId);
  const html = useLifeReportHtmlQuery(reportId);

  if (report.isLoading || html.isLoading) {
    return <LifeLoading />;
  }
  if (report.isError || html.isError || !report.data || !html.data) {
    return (
      <LifeError
        title={localize('com_life_report_not_found')}
        message={localize('com_life_report_not_found_help')}
        onRetry={() => {
          report.refetch();
          html.refetch();
        }}
      />
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-surface-secondary">
      <header className="flex-none border-b border-border-light bg-surface-primary px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="flex items-start gap-3">
            <Link
              to="/archive"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              aria-label={localize('com_life_back_archive')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-[0.14em] text-life-cinnabar dark:text-[#D98A76]">
                {localize('com_life_private_report')}
              </p>
              <h1 className="mt-1 truncate text-xl font-semibold text-text-primary sm:text-2xl">
                {report.data.report.title}
              </h1>
            </div>
          </div>
          <ReportActions reportId={reportId} title={report.data.report.title} />
        </div>
      </header>
      <div className="min-h-0 flex-1 p-2 sm:p-4">
        <iframe
          data-testid="life-report-frame"
          title={report.data.report.title}
          sandbox="allow-scripts"
          srcDoc={html.data}
          className="h-full min-h-[70dvh] w-full rounded-2xl border border-border-light bg-white shadow-sm"
        />
      </div>
    </main>
  );
}
