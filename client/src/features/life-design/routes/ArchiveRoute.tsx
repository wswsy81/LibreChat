import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LifeBirthDraftField, LifeSelfProjectionAvailability } from 'librechat-data-provider';
import {
  useLifeArchiveQuery,
  useLifeBootstrapQuery,
  useLifeSelfProjectionQuery,
} from '~/data-provider';
import { formatLifeDate, formatLifeTimelineWhen } from '../utils/date';
import { PUBLIC_MAP_LABEL_KEYS } from '../components/PublicMistMap';
import { LifeError, LifeLoading } from '../components/PageState';
import ArchiveDossier from '../components/ArchiveDossier';
import ArchiveMistMap from '../components/ArchiveMistMap';
import BasicsForm from '../components/BasicsForm';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import MeRoute from './MeRoute';

const BIRTH_LABEL_KEYS = {
  sun: 'com_life_me_birth_sun',
  moon: 'com_life_me_birth_moon',
  rising: 'com_life_me_birth_rising',
} as const satisfies Record<string, TranslationKeys>;

const STATE_CHAIN_SURFACE_KEYS = {
  experiments: 'com_life_me_surface_experiments',
  timeline: 'com_life_me_surface_timeline',
  life_map: 'com_life_me_surface_life_map',
} as const satisfies Record<string, TranslationKeys>;

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

function ToolSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-8 border-b border-life-ink/70 py-10 dark:border-white/30 sm:py-12"
    >
      <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss dark:text-emerald-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-pretty font-life-serif text-life-title font-semibold leading-tight text-life-ink dark:text-gray-100 sm:text-life-display">
        {title}
      </h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function BirthField({ label, field }: { label: TranslationKeys; field: LifeBirthDraftField }) {
  const localize = useLocalize();
  let value = localize('com_life_me_birth_unavailable');
  let certainty = localize('com_life_me_birth_certainty_unavailable');
  if (field.certainty === 'exact') {
    value = field.sign ? `${field.sign}／${field.name}` : field.name;
    certainty = localize('com_life_me_birth_certainty_exact');
  } else if (field.certainty === 'candidate') {
    value = field.candidates.join(' · ');
    certainty = localize('com_life_me_birth_certainty_candidate');
  }
  return (
    <div className="grid gap-3 border-t border-life-rule py-4 dark:border-white/10 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-baseline">
      <p className="font-life-serif text-life-lead font-semibold">{localize(label)}</p>
      <div>
        <p className="font-life-sans text-life-body text-life-ink dark:text-gray-200">{value}</p>
        <p className="mt-1 font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
          {field.meaning}
        </p>
      </div>
      <p className="font-life-mono text-life-meta tracking-[0.1em] text-life-brass">{certainty}</p>
    </div>
  );
}

function BirthReference({
  availability,
  birthDraft,
}: {
  availability: LifeSelfProjectionAvailability;
  birthDraft: {
    status: 'unavailable' | 'partial' | 'complete';
    sun: LifeBirthDraftField;
    moon: LifeBirthDraftField;
    rising: LifeBirthDraftField;
  };
}) {
  const localize = useLocalize();
  const hasBirth =
    birthDraft.status !== 'unavailable' || availability === 'temporarily_unavailable';

  if (availability === 'temporarily_unavailable') {
    return (
      <p role="status" className="font-life-kai text-life-body leading-8 text-life-muted">
        {localize('com_life_me_birth_temporarily_unavailable')}
      </p>
    );
  }
  if (!hasBirth) {
    return (
      <div>
        <p className="max-w-[36em] font-life-kai text-life-body leading-8 text-life-muted dark:text-gray-400">
          {localize('com_life_me_birth_empty')}
        </p>
        <Link
          to="/me#me-basics"
          className="mt-3 inline-flex min-h-11 items-center border-b border-life-moss font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink dark:text-emerald-400"
        >
          {localize('com_life_me_add_birth')}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }
  return (
    <div className="border-b border-life-rule dark:border-white/10">
      <BirthField label={BIRTH_LABEL_KEYS.sun} field={birthDraft.sun} />
      <BirthField label={BIRTH_LABEL_KEYS.moon} field={birthDraft.moon} />
      <BirthField label={BIRTH_LABEL_KEYS.rising} field={birthDraft.rising} />
    </div>
  );
}

export default function ArchiveRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const archive = useLifeArchiveQuery();
  const bootstrap = useLifeBootstrapQuery();
  const selfProjection = useLifeSelfProjectionQuery();
  const articleRef = useRef<HTMLElement>(null);
  const [birthOpen, setBirthOpen] = useState(location.hash === '#me-birth-reference');
  const [sourcesOpen, setSourcesOpen] = useState(location.hash === '#me-sources');
  const [basicsOpen, setBasicsOpen] = useState(location.hash === '#me-basics');

  useEffect(() => {
    if (location.hash === '#me-birth-reference') setBirthOpen(true);
    if (location.hash === '#me-sources') setSourcesOpen(true);
    if (location.hash === '#me-basics') setBasicsOpen(true);
  }, [location.hash]);

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return;
    if (targetId === 'me-birth-reference' && !birthOpen) return;
    if (targetId === 'me-sources' && !sourcesOpen) return;
    if (targetId === 'me-basics' && !basicsOpen) return;

    const target = document.getElementById(targetId);
    const article = articleRef.current;
    if (!target || !article) return;

    const scrollToTarget = () => target.scrollIntoView({ block: 'start' });
    const frame = window.requestAnimationFrame(scrollToTarget);

    if (typeof window.ResizeObserver !== 'function') {
      const fallback = window.setTimeout(scrollToTarget, 500);
      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(fallback);
      };
    }

    let articleHeight = article.getBoundingClientRect().height;
    const observer = new window.ResizeObserver(([entry]) => {
      const nextHeight = entry?.contentRect.height ?? article.getBoundingClientRect().height;
      if (Math.abs(nextHeight - articleHeight) < 1) return;
      articleHeight = nextHeight;
      scrollToTarget();
    });
    observer.observe(article);
    const stopObserving = window.setTimeout(() => observer.disconnect(), 3000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(stopObserving);
      observer.disconnect();
    };
  }, [archive.data, basicsOpen, birthOpen, location.hash, selfProjection.data, sourcesOpen]);

  if (archive.isLoading || selfProjection.isLoading) return <LifeLoading />;
  if (archive.isError || !archive.data || selfProjection.isError || !selfProjection.data) {
    return (
      <LifeError
        title={localize('com_life_archive_unavailable')}
        message={localize('com_life_archive_unavailable_help')}
        onRetry={() => {
          archive.refetch();
          selfProjection.refetch();
        }}
        onContinue={() => navigate('/c/new')}
      />
    );
  }

  const { activeHouse, profile, reports, profileVersion } = archive.data;
  const projection = selfProjection.data.projection;
  const birthAvailability = selfProjection.data.availability.birthDraft;
  const activeHouseName = activeHouse ? localize(PUBLIC_MAP_LABEL_KEYS[activeHouse]) : null;
  const wheel = projection.lifeWheel || bootstrap.data?.summary?.lifeWheel;
  const chain = projection.stateChain.slice(0, 12);
  const contents = [
    { id: 'me-actor', label: localize('com_life_me_actor_title'), index: '01' },
    { id: 'me-agent', label: localize('com_life_me_agent_title'), index: '02' },
    { id: 'me-author', label: localize('com_life_me_author_title'), index: '03' },
    { id: 'me-dynamics', label: localize('com_life_me_dynamics_title'), index: '04' },
    { id: 'me-becoming', label: localize('com_life_me_becoming_title'), index: '05' },
  ];
  const tools = [
    { id: 'me-life-map', label: localize('com_life_archive_map_history_title') },
    { id: 'me-state-chain', label: localize('com_life_me_state_chain_title') },
    { id: 'me-birth-reference', label: localize('com_life_me_birth_reference_title') },
    { id: 'me-sources', label: localize('com_life_me_sources_title') },
    { id: 'me-basics', label: localize('com_life_archive_basics_title') },
  ];

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="max-w-4xl">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_archive_current_meta')}
          </p>
          <h1 className="mt-4 text-pretty font-life-serif text-life-title font-black leading-[1.12] text-life-ink dark:text-gray-100 sm:text-life-display">
            {profile.alias || localize('com_life_my_archive')}
          </h1>
          <p className="mt-5 max-w-[36em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
            {localize('com_life_me_page_intro', { 0: dateText(profile.updatedAt) })}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-life-mono text-life-meta tracking-[0.12em] text-life-muted dark:text-gray-500">
            <span>{localize('com_life_archive_private')}</span>
            <span>{localize('com_life_archive_version', { 0: versionText(profileVersion) })}</span>
          </div>
          {activeHouseName ? (
            <p className="mt-6 max-w-[36em] border-l-2 border-life-cinnabar pl-4 font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
              {localize('com_life_archive_active_domain', { 0: activeHouseName })}
            </p>
          ) : null}
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start lg:gap-12">
          <nav
            aria-label={localize('com_life_archive_contents_label')}
            className="border-y border-life-ink/70 py-5 dark:border-white/30 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1"
          >
            <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss dark:text-emerald-400">
              {localize('com_life_archive_contents')}
            </p>
            <ol className="mt-4">
              {contents.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/me#${item.id}`}
                    className="flex min-h-11 items-center justify-between gap-4 border-b border-life-rule py-2 font-life-sans text-life-sm text-life-ink transition hover:border-life-ink hover:text-life-cinnabar dark:border-white/10 dark:text-gray-200 dark:hover:text-[#D98A76]"
                  >
                    <span>{item.label}</span>
                    <span className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500">
                      {item.index}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <p className="mt-6 font-life-mono text-life-meta tracking-[0.18em] text-life-muted dark:text-gray-500">
              {localize('com_life_me_tools')}
            </p>
            <ul className="mt-2">
              {tools.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/me#${item.id}`}
                    className="flex min-h-11 items-center border-b border-life-rule py-2 font-life-sans text-life-sm text-life-muted transition hover:border-life-ink hover:text-life-cinnabar dark:border-white/10 dark:text-gray-400"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <article ref={articleRef} className="min-w-0 lg:col-start-1 lg:row-start-1">
            <MeRoute embedded />

            <ToolSection
              id="me-life-map"
              eyebrow={localize('com_life_me_tool_eyebrow')}
              title={localize('com_life_archive_map_history_title')}
            >
              <p className="mb-7 max-w-[36em] font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
                {localize('com_life_me_map_help')}
              </p>
              <ArchiveMistMap wheel={wheel} />
            </ToolSection>

            <ToolSection
              id="me-state-chain"
              eyebrow={localize('com_life_me_tool_eyebrow')}
              title={localize('com_life_me_state_chain_title')}
            >
              <p className="mb-6 max-w-[36em] font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
                {localize('com_life_me_state_chain_help')}
              </p>
              {chain.length ? (
                <ol>
                  {chain.map((entry) => (
                    <li
                      key={entry.id}
                      className="grid gap-2 border-b border-life-rule py-4 dark:border-white/10 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-5"
                    >
                      <span className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500">
                        {timelineDateText(entry.at)}
                      </span>
                      <div>
                        <p className="font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-200">
                          {entry.title}
                        </p>
                        {entry.detail ? (
                          <p className="mt-1 font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
                            {entry.detail}
                          </p>
                        ) : null}
                        <div
                          className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-life-mono text-life-meta tracking-[0.08em] text-life-brass"
                          aria-label={localize('com_life_me_chain_surfaces_label')}
                        >
                          {entry.surfaces.map((surface) => (
                            <span key={surface}>{localize(STATE_CHAIN_SURFACE_KEYS[surface])}</span>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="font-life-kai text-life-body leading-8 text-life-muted dark:text-gray-400">
                  {localize('com_life_me_state_chain_empty')}
                </p>
              )}
            </ToolSection>

            <ToolSection
              id="me-birth-reference"
              eyebrow={localize('com_life_me_tool_eyebrow')}
              title={localize('com_life_me_birth_reference_title')}
            >
              <p className="max-w-[36em] font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
                {localize('com_life_me_birth_reference_notice')}
              </p>
              <button
                type="button"
                aria-expanded={birthOpen}
                aria-controls="me-birth-reference-content"
                onClick={() => setBirthOpen((open) => !open)}
                className="mt-5 inline-flex min-h-11 items-center border-b border-life-brass font-life-sans text-life-sm font-medium text-life-brass hover:text-life-ink"
              >
                {localize(
                  birthOpen
                    ? 'com_life_me_birth_reference_collapse'
                    : 'com_life_me_birth_reference_expand',
                )}
                {birthOpen ? (
                  <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                )}
              </button>
              {birthOpen ? (
                <div id="me-birth-reference-content" className="mt-7">
                  <BirthReference
                    availability={birthAvailability}
                    birthDraft={projection.birthDraft}
                  />
                </div>
              ) : null}
            </ToolSection>

            <ToolSection
              id="me-sources"
              eyebrow={localize('com_life_me_tool_eyebrow')}
              title={localize('com_life_me_sources_title')}
            >
              <p className="max-w-[36em] font-life-kai text-life-body leading-8 text-life-muted dark:text-gray-400">
                {localize('com_life_me_sources_help')}
              </p>
              <button
                type="button"
                aria-expanded={sourcesOpen}
                aria-controls="me-sources-content"
                onClick={() => setSourcesOpen((open) => !open)}
                className="mt-5 inline-flex min-h-11 items-center border-b border-life-brass font-life-sans text-life-sm font-medium text-life-brass hover:text-life-ink"
              >
                {localize(
                  sourcesOpen ? 'com_life_me_sources_collapse' : 'com_life_me_sources_expand',
                )}
                {sourcesOpen ? (
                  <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                )}
              </button>
              {sourcesOpen ? (
                <div id="me-sources-content" className="mt-8">
                  <ArchiveDossier />
                  {reports.length ? (
                    <div className="mt-9">
                      <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-muted dark:text-gray-500">
                        {localize('com_life_archive_reports_title')}
                      </p>
                      <ol className="mt-3">
                        {reports.map((report) => (
                          <li key={report.id}>
                            <Link
                              to={`/archive/reports/${report.id}`}
                              className="group grid min-h-16 gap-2 border-b border-life-rule py-4 transition hover:border-life-ink dark:border-white/10 sm:grid-cols-[100px_minmax(0,1fr)_24px] sm:items-center sm:gap-4"
                            >
                              <span className="font-life-mono text-life-meta tabular-nums text-life-muted dark:text-gray-500">
                                {compactDateText(report.createdAt)}
                              </span>
                              <span className="font-life-serif text-life-lead font-semibold leading-7 text-life-ink group-hover:text-life-cinnabar dark:text-gray-100">
                                {report.title}
                              </span>
                              <ArrowRight className="hidden h-4 w-4 text-life-cinnabar sm:block" />
                            </Link>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </ToolSection>

            <ToolSection
              id="me-basics"
              eyebrow={localize('com_life_archive_basics_meta')}
              title={localize('com_life_archive_basics_title')}
            >
              <p className="max-w-[36em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-gray-400">
                {localize('com_life_archive_basics_summary')}
              </p>
              <button
                type="button"
                aria-expanded={basicsOpen}
                aria-controls="me-basics-form"
                onClick={() => setBasicsOpen((open) => !open)}
                className="mt-5 inline-flex min-h-11 items-center border-b border-life-moss font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink dark:text-emerald-400"
              >
                {localize(
                  basicsOpen
                    ? 'com_life_archive_basics_collapse'
                    : 'com_life_archive_basics_expand',
                )}
                {basicsOpen ? (
                  <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
                )}
              </button>
              {basicsOpen ? (
                <div id="me-basics-form" className="mt-7">
                  <BasicsForm />
                </div>
              ) : null}
            </ToolSection>
          </article>
        </div>
      </div>
    </main>
  );
}
