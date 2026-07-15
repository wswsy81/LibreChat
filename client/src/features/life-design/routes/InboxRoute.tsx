import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useLifeInboxMutation, useLifeInboxQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { track } from '~/utils/track';
import { LifeError, LifeLoading } from '../components/PageState';

const MAX_TEXT = 2000;

const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '';

export default function InboxRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const list = useLifeInboxQuery();
  const capture = useLifeInboxMutation();

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_TEXT && !capture.isLoading;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    capture.mutate(trimmed, {
      onSuccess: () => {
        track('inbox_captured');
        setText('');
      },
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  const items = list.data?.items ?? [];
  let recentContent;

  if (list.isLoading) {
    recentContent = <LifeLoading />;
  } else if (list.isError) {
    recentContent = (
      <LifeError
        title={localize('com_life_inbox_list_failed')}
        message={localize('com_life_inbox_list_failed_help')}
        onRetry={() => list.refetch()}
        onContinue={() => navigate('/resume')}
      />
    );
  } else if (items.length) {
    recentContent = (
      <ul>
        {items.map((entry) => (
          <li
            key={entry.id}
            className="min-w-0 border-b border-life-rule py-6 dark:border-white/10"
          >
            <p className="whitespace-pre-wrap break-words font-life-kai text-life-body leading-8 text-life-ink dark:text-gray-200">
              {entry.text}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-life-mono text-[10.5px] tabular-nums text-life-muted dark:text-gray-500">
              <span>{dateText(entry.capturedAt)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  entry.digested
                    ? 'text-life-moss dark:text-emerald-400'
                    : 'text-life-cinnabar dark:text-[#D98A76]'
                }
              >
                {localize(entry.digested ? 'com_life_inbox_digested' : 'com_life_inbox_pending')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  } else {
    recentContent = (
      <p className="border-b border-life-rule py-8 font-life-kai text-life-body leading-8 text-life-muted dark:border-white/10 dark:text-gray-400">
        {localize('com_life_inbox_empty')}
      </p>
    );
  }

  return (
    <main className="h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100">
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="max-w-4xl border-b border-life-ink/70 pb-8 dark:border-white/30">
          <p className="font-life-mono text-life-meta tracking-[0.22em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_inbox_eyebrow')}
          </p>
          <h1 className="mt-4 text-pretty font-life-serif text-life-display font-black leading-[1.12] text-life-ink dark:text-gray-100 sm:text-6xl">
            {localize('com_life_inbox_title')}
          </h1>
          <p className="mt-5 max-w-[34em] font-life-sans text-life-body leading-8 text-life-muted dark:text-gray-400">
            {localize('com_life_inbox_description')}
          </p>
        </header>

        <section
          className="grid gap-4 border-b border-life-ink/70 py-8 dark:border-white/30 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-8 sm:py-10"
          aria-labelledby="life-inbox-capture"
        >
          <p className="font-life-mono text-life-meta tabular-nums tracking-[0.16em] text-life-cinnabar dark:text-[#D98A76]">
            01
          </p>
          <label htmlFor="life-inbox-input" id="life-inbox-capture" className="sr-only">
            {localize('com_life_inbox_placeholder')}
          </label>
          <div className="min-w-0 border border-life-rule bg-[#F7F4EB] p-5 dark:border-white/10 dark:bg-surface-primary sm:p-6">
            <textarea
              id="life-inbox-input"
              value={text}
              maxLength={MAX_TEXT}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              rows={5}
              placeholder={localize('com_life_inbox_placeholder')}
              className="min-h-[152px] w-full resize-y border-b border-life-rule bg-transparent pb-3 font-life-kai text-life-lead leading-9 text-[#3E4A40] outline-none placeholder:text-life-muted/60 focus:border-life-ink dark:border-white/15 dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:border-gray-300"
            />
            <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-life-mono text-[10.5px] leading-5 text-life-muted dark:text-gray-500">
                {localize('com_life_inbox_hint')}
              </span>
              <Button
                type="button"
                disabled={!canSubmit}
                onClick={submit}
                className="min-h-11 rounded-[4px] bg-life-moss px-6 font-life-sans text-life-sm text-life-paper hover:bg-life-moss-deep focus-visible:ring-2 focus-visible:ring-life-moss/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <NotebookPen aria-hidden="true" className="mr-2 h-4 w-4" />
                {capture.isLoading
                  ? localize('com_life_inbox_saving')
                  : localize('com_life_inbox_save')}
              </Button>
            </div>
            {capture.isError && (
              <p
                role="alert"
                className="mt-4 font-life-sans text-life-sm leading-6 text-life-cinnabar dark:text-[#D98A76]"
              >
                {localize('com_life_inbox_save_failed')}
              </p>
            )}
          </div>
        </section>

        <aside className="grid gap-3 border-b border-life-rule py-5 dark:border-white/10 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-8">
          <NotebookPen aria-hidden="true" className="mt-1 h-4 w-4 text-life-cinnabar" />
          <p className="max-w-[34em] font-life-kai text-life-body leading-8 text-life-brass dark:text-[#CBAA72]">
            {localize('com_life_inbox_digest_note')}
          </p>
        </aside>

        <section className="mt-10" aria-labelledby="life-inbox-list">
          <div className="flex items-end justify-between gap-4 border-b border-life-ink/70 pb-4 dark:border-white/30">
            <h2
              id="life-inbox-list"
              className="font-life-serif text-life-lead font-semibold text-life-ink dark:text-gray-100"
            >
              {localize('com_life_inbox_recent')}
            </h2>
            <span className="font-life-mono text-life-meta tabular-nums tracking-[0.16em] text-life-muted dark:text-gray-500">
              02
            </span>
          </div>
          {recentContent}
        </section>
      </div>
    </main>
  );
}
