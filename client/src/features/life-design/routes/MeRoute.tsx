import { useEffect, useState } from 'react';
import { ArrowRight, Check, Pencil, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, useToastContext } from '@librechat/client';
import type {
  LifeDossierAction,
  LifeSelfChapterId,
  LifeSelfChapterItem,
} from 'librechat-data-provider';
import BasicsForm from '../components/BasicsForm';
import { LifeError, LifeLoading } from '../components/PageState';
import {
  useLifeBootstrapQuery,
  useLifeDossierAnnotateMutation,
  useLifeSelfProjectionQuery,
} from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

const CHAPTERS: Array<{
  id: LifeSelfChapterId;
  anchor: string;
  eyebrow: TranslationKeys;
  title: TranslationKeys;
}> = [
  {
    id: 'actor',
    anchor: 'me-actor',
    eyebrow: 'com_life_me_actor_eyebrow',
    title: 'com_life_me_actor_title',
  },
  {
    id: 'agent',
    anchor: 'me-agent',
    eyebrow: 'com_life_me_agent_eyebrow',
    title: 'com_life_me_agent_title',
  },
  {
    id: 'author',
    anchor: 'me-author',
    eyebrow: 'com_life_me_author_eyebrow',
    title: 'com_life_me_author_title',
  },
  {
    id: 'dynamics',
    anchor: 'me-dynamics',
    eyebrow: 'com_life_me_dynamics_eyebrow',
    title: 'com_life_me_dynamics_title',
  },
  {
    id: 'becoming',
    anchor: 'me-becoming',
    eyebrow: 'com_life_me_becoming_eyebrow',
    title: 'com_life_me_becoming_title',
  },
];

const STATUS_KEYS: Record<LifeSelfChapterItem['status'], TranslationKeys> = {
  confirmed: 'com_life_me_status_confirmed',
  user_rewrite: 'com_life_me_status_rewrite',
  pending: 'com_life_me_status_pending',
  active: 'com_life_me_status_active',
  needs_adjustment: 'com_life_me_status_needs_adjustment',
  closed: 'com_life_me_status_closed',
};

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-7">
      <p className="font-life-mono text-life-meta tracking-[0.18em] text-life-moss dark:text-emerald-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-pretty font-life-serif text-life-title font-semibold leading-tight text-life-ink dark:text-gray-100 sm:text-life-display">
        {title}
      </h2>
    </header>
  );
}

function ChapterItem({
  item,
  mergeTarget,
  readonly = false,
}: {
  item: LifeSelfChapterItem;
  mergeTarget?: LifeSelfChapterItem | null;
  readonly?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const annotate = useLifeDossierAnnotateMutation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const dossierRef = item.dossierRef;

  const submit = (action: LifeDossierAction) => {
    if (!dossierRef || annotate.isLoading) return;
    const targetRef = mergeTarget?.dossierRef;
    if (action === 'merge' && !targetRef) return;
    annotate.mutate(
      {
        section: dossierRef.section,
        entryId: dossierRef.entryId,
        action,
        ...(action === 'rewrite' ? { text: text.trim() } : {}),
        ...(action === 'merge' ? { targetEntryId: targetRef?.entryId as string } : {}),
      },
      {
        onSuccess: () => {
          setEditing(false);
          showToast({ message: localize('com_life_me_revision_saved'), status: 'success' });
        },
        onError: () =>
          showToast({ message: localize('com_life_me_revision_failed'), status: 'error' }),
      },
    );
  };

  return (
    <article className="border-t border-life-rule py-6 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-life-mono text-life-meta tracking-[0.1em]">
        <span
          className={
            item.status === 'pending' || item.status === 'needs_adjustment'
              ? 'text-life-brass'
              : 'text-life-moss dark:text-emerald-400'
          }
        >
          {localize(STATUS_KEYS[item.status])}
        </span>
        {item.houseIds?.length ? (
          <span className="text-life-muted dark:text-gray-500">
            {localize('com_life_me_linked_domains', { 0: String(item.houseIds.length) })}
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3">
          <label className="grid gap-2">
            <span className="font-life-sans text-life-sm text-life-muted">
              {localize('com_life_me_rewrite_label')}
            </span>
            <textarea
              value={text}
              maxLength={600}
              rows={4}
              onChange={(event) => setText(event.target.value)}
              className="w-full resize-y rounded-[3px] border border-life-ink bg-life-paper px-3 py-2 font-life-kai text-life-body leading-8 text-life-ink outline-none focus:border-life-cinnabar"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!text.trim() || annotate.isLoading}
              onClick={() => submit('rewrite')}
              className="min-h-11 rounded-[4px] bg-life-moss px-4 font-life-sans text-life-sm text-life-paper hover:bg-life-moss-deep"
            >
              {localize('com_life_me_save_rewrite')}
            </Button>
            <Button
              type="button"
              disabled={annotate.isLoading}
              onClick={() => {
                setText(item.text);
                setEditing(false);
              }}
              className="min-h-11 rounded-[4px] border border-life-rule bg-transparent px-4 font-life-sans text-life-sm text-life-ink hover:border-life-ink"
            >
              {localize('com_life_cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 max-w-[36em] text-pretty font-life-kai text-life-body leading-8 text-life-ink dark:text-gray-200">
          {item.text}
        </p>
      )}

      {item.firstStep || item.learning || item.nextAction ? (
        <dl className="mt-5 grid max-w-[36em] gap-3 border-l-2 border-life-rule pl-4 dark:border-white/20">
          {item.firstStep ? (
            <div>
              <dt className="font-life-mono text-life-meta tracking-[0.1em] text-life-muted">
                {localize('com_life_me_experiment_action')}
              </dt>
              <dd className="mt-1 font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-300">
                {item.firstStep}
              </dd>
            </div>
          ) : null}
          {item.learning ? (
            <div>
              <dt className="font-life-mono text-life-meta tracking-[0.1em] text-life-muted">
                {localize('com_life_me_experiment_learning')}
              </dt>
              <dd className="mt-1 font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-300">
                {item.learning}
              </dd>
            </div>
          ) : null}
          {item.nextAction ? (
            <div>
              <dt className="font-life-mono text-life-meta tracking-[0.1em] text-life-muted">
                {localize('com_life_me_experiment_next')}
              </dt>
              <dd className="mt-1 font-life-sans text-life-sm leading-7 text-life-ink dark:text-gray-300">
                {item.nextAction}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {item.conversationId ? (
          <Link
            to={`/c/${encodeURIComponent(item.conversationId)}`}
            className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-moss hover:text-life-ink dark:text-emerald-400"
          >
            {localize('com_life_me_open_experiment')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
        {!readonly && !editing && dossierRef ? (
          <>
            {item.status === 'pending' ? (
              <button
                type="button"
                disabled={annotate.isLoading}
                onClick={() => submit('keep')}
                className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-moss hover:text-life-ink disabled:opacity-50"
              >
                <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {localize('com_life_me_like_me')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={annotate.isLoading}
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-brass hover:text-life-ink disabled:opacity-50"
            >
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_life_me_rewrite')}
            </button>
            <button
              type="button"
              disabled={annotate.isLoading}
              onClick={() => submit('strike')}
              className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-cinnabar hover:text-life-ink disabled:opacity-50"
            >
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {localize('com_life_me_not_me')}
            </button>
            {mergeTarget?.dossierRef?.section === dossierRef.section ? (
              <button
                type="button"
                disabled={annotate.isLoading}
                onClick={() => submit('merge')}
                className="inline-flex min-h-11 items-center font-life-sans text-life-sm text-life-muted hover:text-life-ink disabled:opacity-50"
              >
                {localize('com_life_me_merge_previous')}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

export default function MeRoute({ embedded = false }: { embedded?: boolean }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const query = useLifeSelfProjectionQuery();
  const bootstrap = useLifeBootstrapQuery();

  useEffect(() => {
    if (embedded || !query.data || window.location.hash !== '#me-basics') return;
    window.requestAnimationFrame(() => {
      document.getElementById('me-basics')?.scrollIntoView({ block: 'start' });
    });
  }, [embedded, query.data]);

  if (query.isLoading) return <LifeLoading />;
  if (query.isError || !query.data) {
    return (
      <LifeError
        title={localize('com_life_me_unavailable')}
        message={localize('com_life_me_unavailable_help')}
        onRetry={() => query.refetch()}
        onContinue={() => navigate('/c/new')}
      />
    );
  }

  const { projection } = query.data;
  const latestUnscoped = bootstrap.data?.unscopedConversations?.[0] ?? null;
  const hasChapterContent = CHAPTERS.some((chapter) => projection.chapters[chapter.id].length);
  const hasReality = Boolean(
    projection.currentState || projection.selfFormula || hasChapterContent,
  );

  return (
    <div
      role={embedded ? undefined : 'main'}
      className={
        embedded
          ? 'text-life-ink dark:text-gray-100'
          : 'h-full overflow-y-auto bg-life-paper text-life-ink dark:bg-surface-secondary dark:text-gray-100'
      }
    >
      <div className={embedded ? '' : 'mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14'}>
        <section
          id="me-current"
          className="scroll-mt-8 border-y border-life-ink/70 py-8 dark:border-white/30 sm:py-10"
        >
          <p className="font-life-mono text-life-meta tracking-[0.2em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_me_eyebrow')}
          </p>
          <h2 className="mt-4 font-life-serif text-life-title font-black leading-tight text-life-ink dark:text-gray-100 sm:text-life-display">
            {localize('com_life_me_title')}
          </h2>
          {projection.currentState ? (
            <p className="mt-5 max-w-[36em] text-pretty font-life-kai text-life-lead leading-9 text-life-ink dark:text-gray-200">
              {projection.currentState.text}
            </p>
          ) : (
            <p className="mt-5 max-w-[36em] font-life-sans text-life-body leading-8 text-life-muted dark:text-gray-400">
              {localize('com_life_me_description')}
            </p>
          )}
          {projection.selfFormula ? (
            <blockquote className="mt-6 max-w-[34em] border-l-2 border-life-cinnabar pl-5 font-life-serif text-life-lead font-semibold leading-[1.8] text-life-ink dark:text-gray-100">
              {projection.selfFormula.text}
            </blockquote>
          ) : null}
          <p className="mt-5 max-w-[36em] font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
            {localize('com_life_me_not_assessment')}
          </p>
        </section>

        {!hasReality ? (
          <div className="border-b border-life-rule py-7 dark:border-white/10">
            <p className="max-w-[36em] font-life-kai text-life-body leading-8 text-life-muted dark:text-gray-400">
              {latestUnscoped
                ? localize('com_life_me_saved_help')
                : localize('com_life_me_empty_help')}
            </p>
            <Link
              to={latestUnscoped ? `/c/${latestUnscoped.conversationId}` : '/c/new'}
              className="mt-5 inline-flex min-h-11 items-center border-b border-life-moss font-life-sans text-life-sm font-medium text-life-moss hover:text-life-ink dark:text-emerald-400"
            >
              {latestUnscoped
                ? localize('com_life_me_resume_saved_chat')
                : localize('com_life_me_direct_chat')}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}

        {CHAPTERS.map((chapter) => {
          const items = projection.chapters[chapter.id];
          return (
            <section
              key={chapter.id}
              id={chapter.anchor}
              className="scroll-mt-8 border-b border-life-ink/70 py-10 dark:border-white/30 sm:py-12"
            >
              <SectionTitle eyebrow={localize(chapter.eyebrow)} title={localize(chapter.title)} />
              {items.length ? (
                items.map((item, index) => (
                  <ChapterItem
                    key={item.id}
                    item={item}
                    readonly={false}
                    mergeTarget={items
                      .slice(0, index)
                      .reverse()
                      .find((prior) =>
                        Boolean(
                          prior.dossierRef &&
                            item.dossierRef &&
                            prior.dossierRef.section === item.dossierRef.section,
                        ),
                      )}
                  />
                ))
              ) : (
                <p className="max-w-[36em] font-life-kai text-life-body leading-8 text-life-muted dark:text-gray-400">
                  {localize('com_life_me_chapter_empty')}
                </p>
              )}
            </section>
          );
        })}

        {!embedded ? (
          <section id="me-basics" className="scroll-mt-8 py-10 sm:py-12">
            <SectionTitle
              eyebrow={localize('com_life_me_basics_eyebrow')}
              title={localize('com_life_me_basics_title')}
            />
            <BasicsForm />
          </section>
        ) : null}
      </div>
    </div>
  );
}
