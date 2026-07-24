import { ArrowRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useLifeArchiveQuery, useLifeBootstrapQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import ArchiveDossier from '../components/ArchiveDossier';
import ArchiveMap from '../components/ArchiveMap';
import BasicsForm from '../components/BasicsForm';
import { Explorer } from '../components/LifeWheel';
import { LifeError, LifeLoading } from '../components/PageState';
import { formatLifeDate, formatLifeTimelineWhen } from '../utils/date';

const dateText = (value?: string | null) => formatLifeDate(value, { dateStyle: 'medium' });

const compactDateText = (value?: string | null) =>
  formatLifeDate(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replaceAll('/', ' / ');

const timelineDateText = (value?: string | null) =>
  formatLifeTimelineWhen(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replaceAll('/', ' / ');

const versionText = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
  return `${compactDateText(value)} · ${time}`;
};

const contentItems = (value?: string | string[]) => {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
};

function ArchiveSection({
  id,
  eyebrow,
  title,
  sectionLabel,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sectionLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-8 border-t border-life-ink/70 py-10 dark:border-white/30 sm:py-12"
    >
      <div className="grid gap-5 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-7">
        <p className="font-life-mono text-life-meta tabular-nums tracking-[0.16em] text-life-cinnabar dark:text-[#D98A76]">
          {sectionLabel}
        </p>
        <div className="min-w-0">
          <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss dark:text-emerald-400">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-life-serif text-life-title font-semibold leading-tight text-life-ink dark:text-gray-100 sm:text-life-display">
            {title}
          </h2>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function ArchiveRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const archive = useLifeArchiveQuery();
  const bootstrap = useLifeBootstrapQuery();

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

  const { profile, reports, profileVersion } = archive.data;
  const problem = profile.problemFrame;
  const signals = profile.signals || [];
  const timeline = (profile.timeline || []).slice(-6).reverse();
  const constraints = contentItems(problem?.constraints);
  const energyGain = contentItems(profile.energy?.gain);

  const contents = [
    { id: 'archive-now', label: localize('com_life_current_map'), index: '01' },
    { id: 'archive-dossier', label: localize('com_life_dossier'), index: '02' },
    { id: 'archive-map', label: localize('com_life_map'), index: '03' },
    { id: 'archive-problem', label: localize('com_life_problem_now'), index: '04' },
    {
      id: 'archive-evidence',
      label: localize('com_life_signals_and_milestones'),
      index: '05',
    },
    { id: 'archive-reports', label: localize('com_life_saved_reports'), index: '06' },
  ];

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="max-w-4xl">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_archive_current_meta')}
          </p>
          <h1 className="mt-4 text-pretty font-life-serif text-life-display font-black leading-[1.12] text-life-ink dark:text-gray-100 sm:text-6xl">
            {profile.alias || localize('com_life_my_archive')}
          </h1>
          <p className="mt-5 max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
            {localize('com_life_archive_ongoing', { 0: dateText(profile.updatedAt) })}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-life-mono text-life-meta tracking-[0.12em] text-life-muted dark:text-gray-500">
            <span>{localize('com_life_archive_private')}</span>
            <span>{localize('com_life_archive_version', { 0: versionText(profileVersion) })}</span>
          </div>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-12">
          <nav
            aria-label={localize('com_life_archive_contents_label')}
            className="border-y border-life-ink/70 py-5 dark:border-white/30 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1"
          >
            <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss dark:text-emerald-400">
              {localize('com_life_archive_contents')}
            </p>
            <ol className="mt-4 grid md:grid-cols-2 md:gap-x-8 lg:grid-cols-1 lg:gap-x-0">
              {contents.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex min-h-11 items-center justify-between gap-4 border-b border-life-rule py-2 font-life-sans text-life-sm text-life-ink transition hover:border-life-ink hover:text-life-cinnabar dark:border-white/10 dark:text-gray-200 dark:hover:text-[#D98A76]"
                  >
                    <span>{item.label}</span>
                    <span className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500">
                      {item.index}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              className="mt-5 min-h-12 w-full rounded-[4px] bg-life-moss px-5 font-life-sans text-life-sm text-life-paper hover:bg-life-moss-deep"
              onClick={() => navigate('/resume')}
            >
              {localize('com_life_continue_archive')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </nav>

          <article className="min-w-0 lg:col-start-1 lg:row-start-1">
            <section
              id="archive-basics"
              aria-label={localize('com_life_archive_basics_title')}
              className="border-b border-life-rule pb-8 dark:border-white/10"
            >
              <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss dark:text-emerald-400">
                {localize('com_life_archive_basics_title')}
              </p>
              <div className="mt-5">
                <BasicsForm />
              </div>
            </section>
            <ArchiveSection
              id="archive-now"
              eyebrow={localize('com_life_archive_role_meta')}
              title={localize('com_life_current_map')}
              sectionLabel={localize('com_life_archive_section_count', { 0: '01' })}
            >
              {profile.archetype && (
                <blockquote className="max-w-[30em] font-life-serif text-life-title font-semibold leading-[1.75] text-life-ink dark:text-gray-100 sm:text-life-title">
                  <span className="mr-2 text-life-cinnabar">“</span>
                  {profile.archetype}
                  <span className="ml-1 text-life-cinnabar">”</span>
                </blockquote>
              )}

              <div className="mt-9">
                <Explorer
                  wheel={bootstrap.data?.summary?.lifeWheel}
                  archiveName={profile.alias || localize('com_life_friend')}
                />
              </div>

              <dl className="mt-8 grid border-y border-life-rule dark:border-white/10 sm:grid-cols-2">
                <div className="py-5 sm:pr-6">
                  <dt className="font-life-mono text-life-meta tracking-[0.16em] text-life-muted dark:text-gray-500">
                    {localize('com_life_workview_meta', {
                      0: localize('com_life_workview'),
                    })}
                  </dt>
                  <dd className="mt-3 font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-200">
                    {profile.compass?.workview || localize('com_life_not_lit_yet')}
                  </dd>
                </div>
                <div className="border-t border-life-rule py-5 dark:border-white/10 sm:border-l sm:border-t-0 sm:pl-6">
                  <dt className="font-life-mono text-life-meta tracking-[0.16em] text-life-muted dark:text-gray-500">
                    {localize('com_life_recovery_meta', {
                      0: localize('com_life_energy_formula'),
                    })}
                  </dt>
                  <dd className="mt-3 font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-200">
                    {energyGain.length ? energyGain.join('；') : localize('com_life_not_lit_yet')}
                  </dd>
                </div>
              </dl>
            </ArchiveSection>

            <ArchiveSection
              id="archive-dossier"
              eyebrow={localize('com_life_dossier_meta')}
              title={localize('com_life_dossier')}
              sectionLabel={localize('com_life_archive_section_count', { 0: '02' })}
            >
              <ArchiveDossier />
            </ArchiveSection>

            <ArchiveSection
              id="archive-map"
              eyebrow={localize('com_life_map_meta')}
              title={localize('com_life_map')}
              sectionLabel={localize('com_life_archive_section_count', { 0: '03' })}
            >
              <ArchiveMap />
            </ArchiveSection>

            <ArchiveSection
              id="archive-problem"
              eyebrow={localize('com_life_archive_question_meta')}
              title={localize('com_life_problem_now')}
              sectionLabel={localize('com_life_archive_section_count', { 0: '04' })}
            >
              {problem?.movable || problem?.surface ? (
                <div>
                  {problem.surface && (
                    <div>
                      <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-muted dark:text-gray-500">
                        {localize('com_life_surface_problem')}
                      </p>
                      <p className="mt-3 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted dark:text-gray-300">
                        {problem.surface}
                      </p>
                    </div>
                  )}

                  {problem.movable && (
                    <div className="mt-7 border-y-2 border-life-cinnabar bg-life-cinnabar/5 px-5 py-6 dark:bg-life-cinnabar/10 sm:px-7">
                      <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-cinnabar dark:text-[#D98A76]">
                        {localize('com_life_movable_problem')}
                      </p>
                      <p className="mt-4 max-w-[34em] font-life-serif text-life-lead font-semibold leading-[1.8] text-life-ink dark:text-gray-100 sm:text-life-title">
                        {problem.movable}
                      </p>
                    </div>
                  )}

                  {constraints.length > 0 && (
                    <div className="mt-8">
                      <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-muted dark:text-gray-500">
                        {localize('com_life_constraints')}
                      </p>
                      <ol className="mt-3">
                        {constraints.map((constraint, index) => (
                          <li
                            key={`${constraint}-${index}`}
                            className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-b border-life-rule py-3.5 dark:border-white/10"
                          >
                            <span className="font-life-mono text-life-meta tabular-nums text-life-brass">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-200">
                              {constraint}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
                  {localize('com_life_problem_empty')}
                </p>
              )}
            </ArchiveSection>

            <ArchiveSection
              id="archive-evidence"
              eyebrow={localize('com_life_archive_evidence_meta')}
              title={localize('com_life_signals_and_milestones')}
              sectionLabel={localize('com_life_archive_section_count', { 0: '05' })}
            >
              {signals.length || timeline.length ? (
                <div>
                  {signals.length > 0 && (
                    <div role="table" aria-label={localize('com_life_signals_and_milestones')}>
                      <div
                        role="row"
                        className="hidden grid-cols-[92px_minmax(0,1fr)_112px] gap-4 border-b border-life-ink/70 pb-3 font-life-mono text-life-meta tracking-[0.12em] text-life-muted dark:border-white/30 dark:text-gray-500 sm:grid"
                      >
                        <span role="columnheader">{localize('com_life_planted_at')}</span>
                        <span role="columnheader">
                          {localize('com_life_archive_observable_signal')}
                        </span>
                        <span role="columnheader">
                          {localize('com_life_archive_status_heading')}
                        </span>
                      </div>
                      {signals.slice(0, 6).map((signal, index) => (
                        <div
                          role="row"
                          key={signal.id || index}
                          className="grid gap-2 border-b border-life-rule py-4 dark:border-white/10 sm:grid-cols-[92px_minmax(0,1fr)_112px] sm:items-start sm:gap-4"
                        >
                          <span
                            role="cell"
                            className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500"
                          >
                            {compactDateText(signal.plantedAt)}
                          </span>
                          <span role="cell" className="min-w-0">
                            <span className="block font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-200">
                              {signal.description || localize('com_life_signal')}
                            </span>
                            {signal.payoff && (
                              <span className="mt-1 block font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
                                {localize('com_life_archive_observation', {
                                  0: signal.payoff,
                                })}
                              </span>
                            )}
                          </span>
                          <span
                            role="cell"
                            className="font-life-mono text-life-meta tracking-[0.08em] text-life-brass"
                          >
                            {signal.status || localize('com_life_archive_status_default')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {timeline.length > 0 && (
                    <div className={signals.length ? 'mt-9' : ''}>
                      <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-muted dark:text-gray-500">
                        {localize('com_life_recent_changes')}
                      </p>
                      <ol className="mt-3">
                        {timeline.map((entry, index) => (
                          <li
                            key={`${entry.when || 'timeline'}-${index}`}
                            className="grid gap-2 border-b border-life-rule py-3.5 dark:border-white/10 sm:grid-cols-[92px_minmax(0,1fr)_112px] sm:gap-4"
                          >
                            <span className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500">
                              {timelineDateText(entry.when)}
                            </span>
                            <span className="font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-200">
                              {entry.what}
                            </span>
                            <span className="font-life-mono text-life-meta text-life-brass">
                              {entry.source || localize('com_life_archive_timeline_source')}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
                  {localize('com_life_testing_empty')}
                </p>
              )}
            </ArchiveSection>

            <ArchiveSection
              id="archive-reports"
              eyebrow={localize('com_life_archive_reports_meta')}
              title={localize('com_life_saved_reports')}
              sectionLabel={localize('com_life_archive_section_count', { 0: '06' })}
            >
              {reports.length ? (
                <ol>
                  {reports.map((report) => (
                    <li key={report.id}>
                      <Link
                        to={`/archive/reports/${report.id}`}
                        className="group grid min-h-16 gap-2 border-b border-life-rule py-4 transition hover:border-life-ink dark:border-white/10 dark:hover:border-white/40 sm:grid-cols-[92px_minmax(0,1fr)_112px_24px] sm:items-center sm:gap-4"
                      >
                        <span className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500">
                          {compactDateText(report.createdAt)}
                        </span>
                        <span className="min-w-0 font-life-serif text-life-lead font-semibold leading-7 text-life-ink group-hover:text-life-cinnabar dark:text-gray-100 dark:group-hover:text-[#D98A76]">
                          {report.title}
                        </span>
                        <span className="font-life-mono text-life-meta text-life-muted dark:text-gray-500">
                          {localize(
                            report.mode === 'decision'
                              ? 'com_life_decision_report'
                              : 'com_life_discovery_report',
                          )}
                        </span>
                        <ArrowRight className="hidden h-4 w-4 text-life-cinnabar transition-transform group-hover:translate-x-1 sm:block" />
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="max-w-[34em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
                  {localize('com_life_reports_empty')}
                </p>
              )}
            </ArchiveSection>
          </article>
        </div>
      </div>
    </main>
  );
}
