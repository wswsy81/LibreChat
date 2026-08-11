import { Button } from '@librechat/client';
import { ArrowRight, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { LifeBootstrapResponse } from 'librechat-data-provider';
import { useLifeArchiveQuery, useLifeSelfProjectionQuery } from '~/data-provider';
import { formatLifeDate, formatLifeTimelineWhen } from '../utils/date';
import { useAuthContext, useLocalize } from '~/hooks';
import { Explorer } from './LifeWheel';

const dateText = (value?: string | null) =>
  formatLifeDate(value, { month: '2-digit', day: '2-digit' }, '');

const timelineDateText = (value?: string | null) =>
  formatLifeTimelineWhen(value, { month: '2-digit', day: '2-digit' });

export default function ReturningHome({ bootstrap }: { bootstrap: LifeBootstrapResponse }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { logout } = useAuthContext();
  const archive = useLifeArchiveQuery({ retry: 0, refetchOnWindowFocus: false });
  const selfProjection = useLifeSelfProjectionQuery({ retry: 0, refetchOnWindowFocus: false });
  const name = bootstrap.summary?.alias || bootstrap.user?.name || localize('com_life_friend');
  const currentWorkingThread = bootstrap.currentWorkingThread || null;
  const currentThreadUnknowns = (currentWorkingThread?.keyUnknowns || []).slice(0, 3);
  const currentThreadHouses = currentWorkingThread?.affectedHouses || [];

  const signals = (archive.data?.profile.signals || [])
    .filter((signal) => signal.status !== 'resolved')
    .slice(0, 2);
  const timeline = (archive.data?.profile.timeline || []).slice(-3).reverse();
  const projection = selfProjection.data?.projection;
  const pending = projection?.pending?.[0] || null;
  const confirmedSummary =
    projection?.confirmed.find((item) => item.status === 'user_rewrite')?.text ||
    projection?.confirmed[0]?.text ||
    null;
  const realitySummary =
    projection?.selfFormula?.text ||
    confirmedSummary ||
    projection?.currentState?.text ||
    pending?.text ||
    null;
  const isPendingSummary =
    Boolean(pending) &&
    !projection?.selfFormula?.text &&
    !confirmedSummary &&
    !projection?.currentState?.text;
  const birthSummary = projection?.birthDraft.formula || null;
  const selfSummary = realitySummary || birthSummary;
  const birthFields = projection
    ? [projection.birthDraft.sun, projection.birthDraft.moon, projection.birthDraft.rising]
    : [];
  const exactBirthFields = birthFields.filter((field) => field.certainty === 'exact');

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        {/* 眉标 + 欢迎 */}
        <p className="font-life-mono text-life-meta tracking-[0.12em] text-life-muted dark:text-gray-500">
          {localize('com_life_meta_observer')} ·{' '}
          {localize('com_life_updated_at', { 0: dateText(archive.data?.profile.updatedAt) || '—' })}
        </p>
        <h1 className="mt-3 font-life-serif text-life-title font-semibold text-life-ink dark:text-gray-100 sm:text-life-display">
          {localize('com_life_welcome_back', { 0: name })}
        </h1>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div data-testid="home-main-column" className="grid content-start gap-8">
            {/* ① 真问题 = 视觉绝对主角 */}
            <section aria-labelledby="problem-title">
              <p
                id="problem-title"
                className="font-life-mono text-life-meta tracking-[0.18em] text-life-muted dark:text-gray-500"
              >
                ——{' '}
                {currentWorkingThread
                  ? localize('com_life_current_thread')
                  : localize('com_life_last_time')}
              </p>
              <p className="mt-4 max-w-[34em] font-life-serif text-life-lead font-semibold text-life-ink underline decoration-life-cinnabar/50 decoration-2 underline-offset-8 dark:text-gray-100">
                {currentWorkingThread?.title ||
                  bootstrap.summary?.lastSurface ||
                  bootstrap.lastConversationTitle ||
                  localize('com_life_archive_waiting')}
              </p>
              {currentThreadUnknowns.length > 0 && (
                <div className="mt-6 max-w-[34em] border-l-2 border-life-rule pl-4">
                  <p className="font-life-mono text-life-meta tracking-[0.12em] text-life-muted">
                    {localize('com_life_thread_unknowns')}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {currentThreadUnknowns.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="font-life-kai text-life-sm leading-7 text-life-muted"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {currentThreadHouses.length > 0 && (
                <div
                  className="mt-5 flex flex-wrap gap-2"
                  aria-label={localize('com_life_related_houses')}
                >
                  {currentThreadHouses.map((house) => (
                    <span
                      key={house.houseId}
                      className="border border-life-moss/45 px-3 py-1 font-life-mono text-life-meta tracking-[0.08em] text-life-moss"
                    >
                      {house.publicName}
                    </span>
                  ))}
                </div>
              )}
              {/* ② 唯一主行动 */}
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button
                  type="button"
                  className="min-h-12 rounded-[4px] bg-life-moss px-7 font-life-sans text-life-body text-life-paper hover:bg-life-moss-deep"
                  onClick={() =>
                    navigate(
                      currentWorkingThread
                        ? `/c/${encodeURIComponent(currentWorkingThread.conversationId)}`
                        : '/resume',
                    )
                  }
                >
                  {currentWorkingThread
                    ? localize('com_life_continue_thread')
                    : localize('com_life_continue_here')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Link
                  to="/c/new"
                  className="inline-flex min-h-11 items-center border border-life-moss px-5 font-life-sans text-life-sm text-life-moss transition hover:bg-life-moss hover:text-life-paper"
                >
                  {localize('com_life_free_chat_action')}
                </Link>
                <button
                  type="button"
                  className="min-h-11 border-b border-life-rule px-1 font-life-sans text-life-sm text-life-muted transition hover:border-life-ink hover:text-life-ink dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={() => navigate('/me')}
                >
                  {localize('com_life_nav_me')}
                </button>
              </div>
            </section>
          </div>

          <aside className="grid gap-5" aria-label={localize('com_life_home_side_summary')}>
            <section
              className="border border-life-rule bg-[#F7F4EB] p-6 dark:border-white/10 dark:bg-surface-primary"
              style={{ borderTopWidth: 3, borderTopColor: '#355B47' }}
              aria-labelledby="testing-title"
            >
              <p
                id="testing-title"
                className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss"
              >
                {localize('com_life_testing_now')}
              </p>
              {signals.length ? (
                <ul className="mt-4 space-y-4">
                  {signals.map((signal, index) => (
                    <li key={signal.id || index}>
                      <p className="font-life-serif text-life-lead font-semibold leading-8 text-life-ink dark:text-gray-100">
                        {signal.description}
                      </p>
                      {signal.status && (
                        <span className="mt-1 inline-block font-life-mono text-life-meta text-life-brass">
                          {signal.status}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-life-sm leading-7 text-life-muted dark:text-gray-400">
                  {localize('com_life_no_signal_yet')}
                </p>
              )}
            </section>

            {selfSummary && (
              <section
                className="border border-life-rule bg-[#F7F4EB] p-6 dark:border-white/10 dark:bg-surface-primary"
                style={{ borderTopWidth: 3, borderTopColor: '#B94831' }}
                aria-labelledby="home-self-title"
              >
                <p
                  id="home-self-title"
                  className="font-life-mono text-life-meta tracking-[0.18em] text-life-cinnabar"
                >
                  {birthSummary && !realitySummary
                    ? localize('com_life_home_archetype_title')
                    : localize('com_life_home_self_title')}
                </p>
                {!realitySummary && exactBirthFields.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 border-y border-life-rule py-3 text-center">
                    {exactBirthFields.map((field, index) => (
                      <span
                        key={`${field.certainty}-${field.name}-${index}`}
                        className="font-life-serif text-life-sm font-semibold text-life-ink"
                      >
                        {field.certainty === 'exact' ? field.name : ''}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-4 font-life-kai text-life-body leading-8 text-life-ink">
                  {selfSummary}
                </p>
                {isPendingSummary && (
                  <p className="mt-3 font-life-mono text-life-meta tracking-[0.1em] text-life-brass">
                    {localize('com_life_me_status_pending')}
                  </p>
                )}
                <Link
                  to="/me"
                  className="mt-5 inline-flex min-h-11 items-center font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink"
                >
                  {localize('com_life_home_self_link')}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </section>
            )}
          </aside>
        </div>

        <section className="mt-12" aria-labelledby="life-map-title">
          <h2
            id="life-map-title"
            className="font-life-serif text-life-lead font-semibold text-life-ink dark:text-gray-100"
          >
            {localize('com_life_wheel_title')}
          </h2>
          <p className="mt-2 max-w-[34em] text-life-sm leading-7 text-life-muted dark:text-gray-400">
            {localize('com_life_wheel_description')}
          </p>
          <div className="mt-5">
            <Explorer
              wheel={bootstrap.summary?.lifeWheel}
              archiveName={name}
              domainConversations={bootstrap.domainConversations}
            />
          </div>
        </section>

        {/* ⑦ 最近存档变更 */}
        {timeline.length > 0 && (
          <section className="mt-12" aria-labelledby="changes-title">
            <h2
              id="changes-title"
              className="font-life-mono text-life-meta tracking-[0.18em] text-life-muted dark:text-gray-500"
            >
              {localize('com_life_recent_changes')}
            </h2>
            <div className="mt-3">
              {timeline.map((entry, index) => (
                <div
                  key={`${entry.when || 'entry'}-${index}`}
                  className="flex items-baseline gap-5 border-b border-life-rule py-3.5 dark:border-white/10"
                >
                  <span className="w-14 flex-none font-life-mono text-life-meta text-life-muted dark:text-gray-500">
                    {timelineDateText(entry.when)}
                  </span>
                  <span className="flex-1 text-life-sm leading-7 text-life-ink dark:text-gray-200">
                    {entry.what}
                  </span>
                  {entry.source && (
                    <span className="hidden flex-none font-life-mono text-life-meta text-life-brass sm:block">
                      {entry.source}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 档案入口 + 换个人 */}
        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-life-ink/60 pt-6 dark:border-white/30">
          <Link
            to="/archive"
            className="font-life-sans text-life-sm text-life-ink underline decoration-life-rule underline-offset-4 hover:decoration-life-ink dark:text-gray-200"
          >
            {localize('com_life_archive_card')} →
          </Link>
          <Link
            to="/home?new=1"
            className="font-life-sans text-life-sm text-life-ink underline decoration-life-rule underline-offset-4 hover:decoration-life-ink dark:text-gray-200"
          >
            {localize('com_life_start_new_archive')} →
          </Link>
          {bootstrap.latestReportId && (
            <Link
              to={`/archive/reports/${bootstrap.latestReportId}`}
              className="font-life-sans text-life-sm text-life-ink underline decoration-life-rule underline-offset-4 hover:decoration-life-ink dark:text-gray-200"
            >
              {localize('com_life_latest_report')} →
            </Link>
          )}
          <button
            type="button"
            className="ml-auto inline-flex min-h-11 items-center gap-2 font-life-sans text-life-sm text-life-muted transition hover:text-life-ink dark:text-gray-400 dark:hover:text-gray-200"
            onClick={() => logout('/home')}
          >
            <LogOut className="h-4 w-4" />
            {localize('com_life_switch_person')}
          </button>
        </div>
      </div>
    </main>
  );
}
