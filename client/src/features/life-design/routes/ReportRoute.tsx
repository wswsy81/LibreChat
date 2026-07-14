import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ThemeContext, useMediaQuery } from '@librechat/client';
import { useLifeReportHtmlQuery, useLifeReportQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import ReportActions from '../components/ReportActions';
import { LifeError, LifeLoading } from '../components/PageState';
import {
  applyLifeReportTheme,
  reportHeightFromMessage,
  reportThemeIsDark,
} from '../utils/reportFrame';

const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date(value))
        .replaceAll('/', ' / ')
    : '—';

export default function ReportRoute() {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = reportThemeIsDark(theme, systemDark);
  const { reportId = '' } = useParams();
  const report = useLifeReportQuery(reportId);
  const html = useLifeReportHtmlQuery(reportId);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(900);

  useEffect(() => {
    setFrameHeight(900);
  }, [reportId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const nextHeight = reportHeightFromMessage(event.data);
      if (nextHeight) setFrameHeight(nextHeight);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const themedHtml = useMemo(
    () => (html.data ? applyLifeReportTheme(html.data, dark) : ''),
    [dark, html.data],
  );

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

  const reportMeta = report.data.report;
  const reportType = localize(
    reportMeta.mode === 'decision' ? 'com_life_decision_report' : 'com_life_discovery_report',
  );

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-12">
        <header className="border-b border-life-ink/70 pb-7 dark:border-white/30 lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div className="min-w-0">
            <Link
              to="/archive"
              className="inline-flex min-h-11 items-center gap-2 font-life-sans text-life-sm text-life-muted transition hover:text-life-ink dark:text-gray-400 dark:hover:text-gray-100"
              aria-label={localize('com_life_back_archive')}
            >
              <ArrowLeft className="h-4 w-4" />
              {localize('com_life_back_archive')}
            </Link>
            <p className="mt-5 font-life-mono text-life-meta tracking-[0.2em] text-life-cinnabar dark:text-[#D98A76]">
              {localize('com_life_report_meta', {
                0: localize('com_life_private_report'),
                1: reportType,
              })}
            </p>
            <h1 className="mt-3 max-w-[22em] text-pretty font-life-serif text-life-title font-semibold leading-[1.35] text-life-ink dark:text-gray-100 sm:text-life-display">
              {reportMeta.title}
            </h1>
            <p className="mt-3 font-life-mono text-life-meta tabular-nums tracking-[0.12em] text-life-muted dark:text-[#B4B7B0]">
              {localize('com_life_report_edition', { 0: dateText(reportMeta.createdAt) })}
            </p>
          </div>
          <div className="mt-6 flex-none lg:mt-0">
            <ReportActions reportId={reportId} title={reportMeta.title} />
          </div>
        </header>

        <section className="mt-8 border-y border-life-rule dark:border-white/10">
          <iframe
            ref={frameRef}
            data-testid="life-report-frame"
            title={reportMeta.title}
            sandbox="allow-scripts"
            srcDoc={themedHtml}
            style={{ height: frameHeight }}
            className="block w-full border-0 bg-transparent"
          />
        </section>
      </div>
    </main>
  );
}
