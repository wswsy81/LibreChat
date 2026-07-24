import { useState } from 'react';
import { ArrowRight, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { LifeBootstrapResponse } from 'librechat-data-provider';
import { Button } from '@librechat/client';
import { useLifeArchiveQuery, useLifeInboxMutation } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { Explorer } from './LifeWheel';
import { formatLifeDate, formatLifeTimelineWhen } from '../utils/date';

const dateText = (value?: string | null) =>
  formatLifeDate(value, { month: '2-digit', day: '2-digit' }, '');

const timelineDateText = (value?: string | null) =>
  formatLifeTimelineWhen(value, { month: '2-digit', day: '2-digit' });

export default function ReturningHome({ bootstrap }: { bootstrap: LifeBootstrapResponse }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { logout } = useAuthContext();
  const [note, setNote] = useState('');
  const archive = useLifeArchiveQuery({ retry: 0, refetchOnWindowFocus: false });
  const capture = useLifeInboxMutation();
  const name = bootstrap.summary?.alias || bootstrap.user?.name || localize('com_life_friend');

  const signals = (archive.data?.profile.signals || [])
    .filter((signal) => signal.status !== 'resolved')
    .slice(0, 2);
  const timeline = (archive.data?.profile.timeline || []).slice(-3).reverse();

  const saveNote = () => {
    const text = note.trim();
    if (!text || capture.isLoading) {
      return;
    }
    capture.mutate(text, { onSuccess: () => setNote('') });
  };

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        {/* 眉标 + 欢迎 */}
        <p className="font-life-mono text-[11.5px] tracking-[0.12em] text-life-muted dark:text-gray-500">
          {localize('com_life_meta_observer')} ·{' '}
          {localize('com_life_updated_at', { 0: dateText(archive.data?.profile.updatedAt) || '—' })}
        </p>
        <h1 className="mt-3 font-life-serif text-life-title font-semibold text-life-ink dark:text-gray-100 sm:text-life-display">
          {localize('com_life_welcome_back', { 0: name })}
        </h1>

        {/* ① 真问题 = 视觉绝对主角 */}
        <section className="mt-8" aria-labelledby="problem-title">
          <p
            id="problem-title"
            className="font-life-mono text-life-meta tracking-[0.18em] text-life-muted dark:text-gray-500"
          >
            —— {localize('com_life_last_time')}
          </p>
          <p className="mt-4 max-w-[34em] font-life-serif text-life-lead font-semibold text-life-ink underline decoration-life-cinnabar/50 decoration-2 underline-offset-8 dark:text-gray-100">
            {bootstrap.summary?.lastSurface || localize('com_life_archive_waiting')}
          </p>
          {/* ② 唯一主行动 */}
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button
              type="button"
              className="min-h-12 rounded-[4px] bg-life-moss px-7 font-life-sans text-life-body text-life-paper hover:bg-life-moss-deep"
              onClick={() => navigate('/resume')}
            >
              {localize('com_life_continue_here')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <button
              type="button"
              className="min-h-11 border-b border-life-rule px-1 font-life-sans text-life-sm text-life-muted transition hover:border-life-ink hover:text-life-ink dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => navigate('/archive')}
            >
              {localize('com_life_view_archive')}
            </button>
          </div>
        </section>

        {/* ③ 正在验证 + ⑤ 随手记速记 */}
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
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

          <section
            className="border border-life-rule bg-[#F7F4EB] p-6 dark:border-white/10 dark:bg-surface-primary"
            aria-labelledby="capture-title"
          >
            <p
              id="capture-title"
              className="font-life-mono text-life-meta tracking-[0.18em] text-life-muted dark:text-gray-500"
            >
              {localize('com_life_quick_capture')}
            </p>
            <textarea
              value={note}
              maxLength={2000}
              rows={3}
              placeholder={localize('com_life_inbox_placeholder')}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  saveNote();
                }
              }}
              className="mt-4 w-full resize-none border-b border-life-rule bg-transparent pb-2 font-life-kai text-life-body leading-8 text-[#3E4A40] outline-none placeholder:text-life-muted/60 focus:border-life-ink dark:text-gray-200 dark:placeholder:text-gray-600"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-life-mono text-[10.5px] text-life-muted dark:text-gray-500">
                {localize('com_life_quick_capture_hint')}
              </span>
              <button
                type="button"
                disabled={!note.trim() || capture.isLoading}
                onClick={saveNote}
                className="min-h-10 border border-life-moss px-4 font-life-sans text-life-sm text-life-moss transition hover:bg-life-moss hover:text-life-paper disabled:opacity-40"
              >
                {capture.isSuccess && !note
                  ? localize('com_life_quick_capture_done')
                  : localize('com_life_inbox_save')}
              </button>
            </div>
          </section>
        </div>

        <section className="mt-12" aria-labelledby="life-wheel-title">
          <h2
            id="life-wheel-title"
            className="font-life-serif text-life-lead font-semibold text-life-ink dark:text-gray-100"
          >
            {localize('com_life_wheel_title')}
          </h2>
          <p className="mt-2 max-w-[34em] text-life-sm leading-7 text-life-muted dark:text-gray-400">
            {localize('com_life_wheel_description')}
          </p>
          <div className="mt-5">
            <Explorer wheel={bootstrap.summary?.lifeWheel} archiveName={name} />
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
                    <span className="hidden flex-none font-life-mono text-[10.5px] text-life-brass sm:block">
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
