import { ArrowRight, Clock3, FileText, MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useLifeArchiveQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import DashboardBars from '../components/DashboardBars';
import { LifeError, LifeLoading } from '../components/PageState';

const dateText = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '—';

const contentText = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value.join('；') : value;
};

function ArchiveSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-border-light bg-surface-primary p-5 shadow-sm sm:p-7">
      <p className="text-xs font-medium tracking-[0.16em] text-amber-700 dark:text-amber-300">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-text-primary">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ArchiveRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const archive = useLifeArchiveQuery();

  if (archive.isLoading) {
    return <LifeLoading />;
  }
  if (archive.isError || !archive.data) {
    return (
      <LifeError
        title={localize('com_life_archive_unavailable')}
        message={localize('com_life_archive_unavailable_help')}
        onRetry={() => archive.refetch()}
        onContinue={() => navigate('/resume')}
      />
    );
  }

  const { profile, reports } = archive.data;
  const problem = profile.problemFrame;
  const signals = profile.signals || [];
  const timeline = (profile.timeline || []).slice(-6).reverse();

  return (
    <main className="h-full overflow-y-auto bg-surface-secondary">
      <div className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 lg:py-12">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium tracking-[0.18em] text-amber-700 dark:text-amber-300">
              {localize('com_life_archive_eyebrow')}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
              {profile.alias || localize('com_life_my_archive')}
            </h1>
            <p className="mt-3 text-sm text-text-secondary">
              {localize('com_life_updated_at', { 0: dateText(profile.updatedAt) })}
            </p>
          </div>
          <Button
            type="button"
            className="min-h-12 rounded-2xl bg-amber-600 px-6 text-white hover:bg-amber-700"
            onClick={() => navigate('/resume')}
          >
            {localize('com_life_continue_archive')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <ArchiveSection
            eyebrow={localize('com_life_now_me')}
            title={localize('com_life_current_map')}
          >
            {profile.archetype && (
              <blockquote className="mb-5 border-l-2 border-amber-500 pl-4 text-lg leading-8 text-text-primary">
                {profile.archetype}
              </blockquote>
            )}
            <DashboardBars values={profile.dashboards} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-surface-secondary p-4">
                <p className="text-xs text-text-secondary">{localize('com_life_workview')}</p>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {profile.compass?.workview || localize('com_life_not_lit_yet')}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-secondary p-4">
                <p className="text-xs text-text-secondary">{localize('com_life_energy_formula')}</p>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {contentText(profile.energy?.gain) || localize('com_life_not_lit_yet')}
                </p>
              </div>
            </div>
          </ArchiveSection>

          <ArchiveSection
            eyebrow={localize('com_life_true_problem')}
            title={localize('com_life_problem_now')}
          >
            {problem?.movable || problem?.surface ? (
              <div className="space-y-4">
                {problem.surface && (
                  <div>
                    <p className="text-xs text-text-secondary">
                      {localize('com_life_surface_problem')}
                    </p>
                    <p className="mt-2 leading-7 text-text-primary">{problem.surface}</p>
                  </div>
                )}
                {problem.movable && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                      {localize('com_life_movable_problem')}
                    </p>
                    <p className="mt-2 leading-7 text-text-primary">{problem.movable}</p>
                  </div>
                )}
                {contentText(problem.constraints) && (
                  <div>
                    <p className="text-xs text-text-secondary">
                      {localize('com_life_constraints')}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text-primary">
                      {contentText(problem.constraints)}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_life_problem_empty')}
              </p>
            )}
          </ArchiveSection>

          <ArchiveSection
            eyebrow={localize('com_life_testing')}
            title={localize('com_life_signals_and_milestones')}
          >
            {signals.length || timeline.length ? (
              <div className="space-y-3">
                {signals.slice(0, 5).map((signal, index) => (
                  <div
                    key={signal.id || index}
                    className="flex gap-3 rounded-2xl bg-surface-secondary p-4"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
                    <div>
                      <p className="text-sm leading-6 text-text-primary">
                        {signal.description || localize('com_life_signal')}
                      </p>
                      {signal.status && (
                        <p className="mt-1 text-xs text-text-secondary">{signal.status}</p>
                      )}
                    </div>
                  </div>
                ))}
                {timeline.map((entry, index) => (
                  <div
                    key={`${entry.when || 'timeline'}-${index}`}
                    className="flex gap-3 rounded-2xl bg-surface-secondary p-4"
                  >
                    <Clock3 className="mt-0.5 h-4 w-4 flex-none text-text-secondary" />
                    <div>
                      <p className="text-sm leading-6 text-text-primary">{entry.what}</p>
                      {entry.when && (
                        <p className="mt-1 text-xs text-text-secondary">{dateText(entry.when)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_life_testing_empty')}
              </p>
            )}
          </ArchiveSection>

          <ArchiveSection
            eyebrow={localize('com_life_archive_history')}
            title={localize('com_life_saved_reports')}
          >
            {reports.length ? (
              <div className="space-y-3">
                {reports.map((report) => (
                  <Link
                    key={report.id}
                    to={`/archive/reports/${report.id}`}
                    className="flex min-h-20 items-center gap-4 rounded-2xl border border-border-light p-4 transition hover:border-amber-500/30 hover:bg-surface-hover"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      <FileText className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-text-primary">
                        {report.title}
                      </span>
                      <span className="mt-1 block text-xs text-text-secondary">
                        {dateText(report.createdAt)} ·{' '}
                        {localize(
                          report.mode === 'decision'
                            ? 'com_life_decision_report'
                            : 'com_life_discovery_report',
                        )}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 flex-none text-text-secondary" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-text-secondary">
                {localize('com_life_reports_empty')}
              </p>
            )}
          </ArchiveSection>
        </div>
      </div>
    </main>
  );
}
