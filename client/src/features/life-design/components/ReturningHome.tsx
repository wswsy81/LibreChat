import { useState } from 'react';
import { ArrowRight, FileText, LogOut, RotateCcw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { LifeBootstrapResponse } from 'librechat-data-provider';
import { Button } from '@librechat/client';
import { useAuthContext, useLocalize } from '~/hooks';
import DashboardBars from './DashboardBars';
import FirstArchiveSetup from './FirstArchiveSetup';

export default function ReturningHome({ bootstrap }: { bootstrap: LifeBootstrapResponse }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { logout } = useAuthContext();
  const [diagnostic, setDiagnostic] = useState(false);
  const name = bootstrap.summary?.alias || bootstrap.user?.name || localize('com_life_friend');

  if (diagnostic) {
    return (
      <div className="h-full overflow-y-auto bg-surface-secondary px-5 py-10 sm:px-8">
        <FirstArchiveSetup
          diagnostic
          initialName={name}
          initialDashboards={bootstrap.summary?.dashboards}
          onSaved={() => setDiagnostic(false)}
        />
      </div>
    );
  }

  return (
    <main className="h-full overflow-y-auto bg-surface-secondary">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="overflow-hidden rounded-[32px] border border-amber-500/15 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_42%),linear-gradient(135deg,var(--surface-primary),var(--surface-secondary))] p-6 shadow-sm sm:p-10">
          <p className="text-sm font-medium tracking-[0.18em] text-amber-700 dark:text-amber-300">
            {localize('com_life_returning_eyebrow')}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-5xl">
            {localize('com_life_welcome_back', { 0: name })}
          </h1>
          <div className="mt-7 max-w-3xl border-l-2 border-amber-500 pl-5">
            <p className="text-sm text-text-secondary">{localize('com_life_last_time')}</p>
            <p className="mt-2 text-xl font-medium leading-8 text-text-primary sm:text-2xl">
              {bootstrap.summary?.lastSurface || localize('com_life_archive_waiting')}
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              className="min-h-12 rounded-2xl bg-amber-600 px-6 text-white hover:bg-amber-700"
              onClick={() => navigate('/resume')}
            >
              {localize('com_life_continue_archive')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 rounded-2xl px-6"
              onClick={() => navigate('/archive')}
            >
              {localize('com_life_view_archive')}
            </Button>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="bars-title">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-text-secondary">{localize('com_life_current_snapshot')}</p>
              <h2 id="bars-title" className="mt-1 text-2xl font-semibold text-text-primary">
                {localize('com_life_four_bars')}
              </h2>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
              onClick={() => setDiagnostic(true)}
            >
              <RotateCcw className="h-4 w-4" />
              {localize('com_life_recheck_bars')}
            </button>
          </div>
          <DashboardBars values={bootstrap.summary?.dashboards} />
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            to="/archive"
            className="group rounded-3xl border border-border-light bg-surface-primary p-6 transition hover:-translate-y-0.5 hover:border-amber-500/30 hover:shadow-md"
          >
            <FileText className="h-6 w-6 text-amber-600" />
            <h2 className="mt-5 text-lg font-semibold text-text-primary">
              {localize('com_life_archive_card')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {localize('com_life_archive_card_help')}
            </p>
          </Link>
          {bootstrap.latestReportId ? (
            <Link
              to={`/archive/reports/${bootstrap.latestReportId}`}
              className="group rounded-3xl border border-border-light bg-surface-primary p-6 transition hover:-translate-y-0.5 hover:border-amber-500/30 hover:shadow-md"
            >
              <FileText className="h-6 w-6 text-amber-600" />
              <h2 className="mt-5 text-lg font-semibold text-text-primary">
                {localize('com_life_latest_report')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {localize('com_life_report_count', { 0: String(bootstrap.reportCount || 0) })}
              </p>
            </Link>
          ) : (
            <div className="bg-surface-primary/60 rounded-3xl border border-dashed border-border-light p-6">
              <FileText className="h-6 w-6 text-text-secondary" />
              <h2 className="mt-5 text-lg font-semibold text-text-primary">
                {localize('com_life_no_report_yet')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {localize('com_life_no_report_help')}
              </p>
            </div>
          )}
        </section>

        <button
          type="button"
          className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-text-secondary transition hover:text-text-primary"
          onClick={() => logout('/home')}
        >
          <LogOut className="h-4 w-4" />
          {localize('com_life_switch_person')}
        </button>
      </div>
    </main>
  );
}
