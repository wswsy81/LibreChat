import { useState } from 'react';
import { NotebookPen, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import { useLifeInboxMutation, useLifeInboxQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
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
      onSuccess: () => setText(''),
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  const items = list.data?.items ?? [];

  return (
    <main className="h-full overflow-y-auto bg-surface-secondary">
      <div className="mx-auto w-full max-w-3xl px-5 py-9 sm:px-8 lg:py-12">
        <header className="mb-7">
          <p className="text-sm font-medium tracking-[0.18em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_inbox_eyebrow')}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
            {localize('com_life_inbox_title')}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-text-secondary">
            {localize('com_life_inbox_description')}
          </p>
        </header>

        <section
          className="rounded-[28px] border border-border-light bg-surface-primary p-5 shadow-sm sm:p-7"
          aria-labelledby="life-inbox-capture"
        >
          <label htmlFor="life-inbox-input" id="life-inbox-capture" className="sr-only">
            {localize('com_life_inbox_placeholder')}
          </label>
          <textarea
            id="life-inbox-input"
            value={text}
            maxLength={MAX_TEXT}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={4}
            placeholder={localize('com_life_inbox_placeholder')}
            className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary p-4 text-text-primary outline-none transition focus:border-life-moss focus:ring-2 focus:ring-life-moss/15"
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-xs text-text-secondary">
              {localize('com_life_inbox_hint')}
            </span>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className="min-h-11 rounded-xl bg-life-moss px-6 text-life-paper hover:bg-life-moss-deep"
            >
              <NotebookPen className="mr-2 h-4 w-4" />
              {capture.isLoading
                ? localize('com_life_inbox_saving')
                : localize('com_life_inbox_save')}
            </Button>
          </div>
          {capture.isError && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {localize('com_life_inbox_save_failed')}
            </p>
          )}
        </section>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-life-cinnabar/20 bg-life-cinnabar/5 p-4 text-sm leading-6 text-text-secondary">
          <Sparkles className="mt-0.5 h-4 w-4 flex-none text-life-cinnabar" />
          <span>{localize('com_life_inbox_digest_note')}</span>
        </div>

        <section className="mt-8" aria-labelledby="life-inbox-list">
          <h2
            id="life-inbox-list"
            className="mb-4 text-xs font-medium tracking-[0.12em] text-text-secondary"
          >
            {localize('com_life_inbox_recent')}
          </h2>
          {list.isLoading ? (
            <LifeLoading />
          ) : list.isError ? (
            <LifeError
              title={localize('com_life_inbox_list_failed')}
              message={localize('com_life_inbox_list_failed_help')}
              onRetry={() => list.refetch()}
              onContinue={() => navigate('/resume')}
            />
          ) : items.length ? (
            <ul className="space-y-3">
              {items.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-2xl border border-border-light bg-surface-primary p-4"
                >
                  <p className="whitespace-pre-wrap leading-7 text-text-primary">{entry.text}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                    <span>{dateText(entry.capturedAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        entry.digested
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-life-cinnabar dark:text-[#D98A76]'
                      }
                    >
                      {localize(
                        entry.digested ? 'com_life_inbox_digested' : 'com_life_inbox_pending',
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-surface-primary p-5 text-sm leading-6 text-text-secondary">
              {localize('com_life_inbox_empty')}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
