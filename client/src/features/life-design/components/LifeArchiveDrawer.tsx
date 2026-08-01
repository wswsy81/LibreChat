import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Map, Pencil, Save, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type {
  LifeArchiveStatus,
  LifeDossierAction,
  LifeDossierPreviewEntry,
  TMessage,
} from 'librechat-data-provider';
import {
  useLifeArchiveQuery,
  useLifeBootstrapQuery,
  useLifeDossierAnnotateMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn, getLatestText } from '~/utils';
import ArchiveMistMap from './ArchiveMistMap';

const statusChanged = (before: LifeArchiveStatus, after: LifeArchiveStatus) =>
  after.variableCount > before.variableCount ||
  after.dossierClaimCount > before.dossierClaimCount ||
  after.mapVersion !== before.mapVersion ||
  (!before.gateReached && after.gateReached);

const openingSeenKey = (announcedAt: string) => `life-archive-opening:${announcedAt}`;
const ARCHIVE_REFRESH_INTERVAL_MS = 5_000;
const ARCHIVE_REFRESH_WINDOW_MS = 120_000;

export default function LifeArchiveDrawer({
  isSubmitting,
  latestAssistantMessage,
}: {
  isSubmitting: boolean;
  latestAssistantMessage: TMessage | null;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const archive = useLifeArchiveQuery({
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 0,
  });
  const bootstrap = useLifeBootstrapQuery({
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 0,
  });
  const annotate = useLifeDossierAnnotateMutation();
  const previousStatus = useRef<LifeArchiveStatus | null>(null);
  const previousSubmitting = useRef(isSubmitting);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasGlow, setHasGlow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rewriteText, setRewriteText] = useState('');
  const [error, setError] = useState('');
  const [refreshUntil, setRefreshUntil] = useState(0);
  const latestAssistantText =
    latestAssistantMessage?.isCreatedByUser === false ? getLatestText(latestAssistantMessage) : '';

  useEffect(() => {
    const wasSubmitting = previousSubmitting.current;
    previousSubmitting.current = isSubmitting;
    if (!wasSubmitting || isSubmitting) return;

    const refresh = () => {
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
      queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
    };
    refresh();
    setRefreshUntil(Date.now() + ARCHIVE_REFRESH_WINDOW_MS);
  }, [isSubmitting, queryClient]);

  useEffect(() => {
    if (!refreshUntil) return;
    const interval = window.setInterval(() => {
      if (Date.now() >= refreshUntil) {
        setRefreshUntil(0);
        return;
      }
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
      queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
    }, ARCHIVE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [queryClient, refreshUntil]);

  useEffect(() => {
    const status = archive.data?.archiveStatus;
    if (!status) return;
    const before = previousStatus.current;
    if (before && statusChanged(before, status)) {
      setHasGlow(true);
      setRefreshUntil(0);
    }
    previousStatus.current = status;

    const announcedAt = status.openingAnnouncedAt;
    if (!announcedAt || !latestAssistantText.includes(localize('com_life_reveal_opening'))) return;
    try {
      const key = openingSeenKey(announcedAt);
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
      setIsOpen(true);
      setHasGlow(false);
    } catch {
      setIsOpen(true);
      setHasGlow(false);
    }
  }, [archive.data?.archiveStatus, latestAssistantText, localize]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      window.requestAnimationFrame(() => handleRef.current?.focus());
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const toggle = () => {
    setIsOpen((value) => !value);
    setHasGlow(false);
  };

  const mutateEntry = (
    entry: LifeDossierPreviewEntry,
    action: LifeDossierAction,
    text?: string,
  ) => {
    setError('');
    annotate.mutate(
      { section: entry.section, entryId: entry.id, action, text },
      {
        onSuccess: () => {
          setEditingId(null);
          setRewriteText('');
        },
        onError: () => setError(localize('com_life_dossier_annotate_failed')),
      },
    );
  };

  const beginRewrite = (entry: LifeDossierPreviewEntry) => {
    setEditingId(entry.id);
    setRewriteText(entry.text);
    setError('');
  };

  const entries = archive.data?.recentDossier ?? [];

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label={localize('com_life_archive_drawer_close')}
          className="fixed inset-0 z-40 bg-life-ink/20 backdrop-blur-[1px]"
          onClick={toggle}
        />
      )}

      <button
        ref={handleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls="life-archive-drawer"
        aria-label={localize('com_life_archive_drawer_handle')}
        onClick={toggle}
        className={cn(
          'fixed right-4 z-[70] flex min-h-11 min-w-14 items-center justify-center rounded-t-md border border-b-0 border-life-rule bg-life-paper text-life-moss shadow-lg transition hover:border-life-moss motion-reduce:transition-none sm:bottom-auto sm:right-0 sm:top-1/2 sm:min-w-11 sm:-translate-y-1/2 sm:rounded-l-md sm:rounded-r-none sm:border-b sm:border-r-0 sm:px-3',
          isOpen ? 'bottom-[72vh]' : 'bottom-0',
          hasGlow && 'border-life-brass shadow-[0_0_0_6px_rgba(232,184,75,0.18)]',
        )}
      >
        {isOpen ? <X className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        {hasGlow && (
          <span
            data-testid="life-archive-glow"
            className="absolute right-0 top-0 h-2.5 w-2.5 animate-pulse rounded-full bg-life-brass motion-reduce:animate-none"
          />
        )}
      </button>

      <aside
        id="life-archive-drawer"
        aria-label={localize('com_life_archive_drawer_title')}
        aria-hidden={!isOpen}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] flex h-[72vh] flex-col border-t border-life-rule bg-life-paper shadow-2xl transition-transform duration-300 motion-reduce:transition-none sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:w-[440px] sm:border-l sm:border-t-0',
          isOpen
            ? 'translate-y-0 sm:translate-x-0'
            : 'translate-y-full sm:translate-x-full sm:translate-y-0',
        )}
      >
        {isOpen && (
          <>
            <header className="flex items-center justify-between border-b border-life-rule px-5 py-4">
              <div>
                <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-cinnabar">
                  {localize('com_life_archive_drawer_kicker')}
                </p>
                <h2 className="mt-1 font-life-serif text-life-lead font-semibold text-life-ink">
                  {localize('com_life_archive_drawer_title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={toggle}
                className="flex min-h-11 min-w-11 items-center justify-center text-life-muted hover:text-life-ink"
                aria-label={localize('com_life_archive_drawer_close')}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
              <section
                className="border-b border-life-rule py-5"
                aria-labelledby="life-drawer-map-title"
              >
                <h3
                  id="life-drawer-map-title"
                  className="mb-3 flex items-center gap-2 font-life-serif text-life-body font-semibold text-life-ink"
                >
                  <Map className="h-4 w-4 text-life-brass" />
                  {localize('com_life_map')}
                </h3>
                <ArchiveMistMap wheel={bootstrap.data?.summary?.lifeWheel} />
              </section>

              <section className="py-5" aria-labelledby="life-drawer-dossier-title">
                <h3
                  id="life-drawer-dossier-title"
                  className="flex items-center gap-2 font-life-serif text-life-body font-semibold text-life-ink"
                >
                  <BookOpen className="h-4 w-4 text-life-brass" />
                  {localize('com_life_archive_drawer_recent')}
                </h3>
                <p className="mt-1 font-life-kai text-life-sm leading-6 text-life-muted">
                  {localize('com_life_archive_drawer_recent_help')}
                </p>

                {archive.isLoading && (
                  <p className="mt-4 text-life-sm text-life-muted">
                    {localize('com_life_frame_loading')}
                  </p>
                )}
                {!archive.isLoading && entries.length === 0 && (
                  <p className="mt-4 border border-dashed border-life-rule px-4 py-5 font-life-kai text-life-sm leading-7 text-life-muted">
                    {localize('com_life_archive_drawer_empty')}
                  </p>
                )}

                <div className="mt-4 space-y-3">
                  {entries.map((entry) => (
                    <article
                      key={`${entry.section}:${entry.id}`}
                      className="border border-life-rule bg-[#F7F4EB] p-4"
                    >
                      {editingId === entry.id ? (
                        <div>
                          <label className="sr-only" htmlFor={`rewrite-${entry.id}`}>
                            {localize('com_life_dossier_rewrite_prompt')}
                          </label>
                          <textarea
                            id={`rewrite-${entry.id}`}
                            value={rewriteText}
                            onChange={(event) => setRewriteText(event.target.value)}
                            className="min-h-24 w-full resize-y border border-life-rule bg-life-paper px-3 py-2 font-life-kai text-life-sm leading-6 text-life-ink outline-none focus:border-life-moss"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="min-h-11 px-3 text-life-sm text-life-muted"
                            >
                              {localize('com_life_cancel')}
                            </button>
                            <button
                              type="button"
                              disabled={!rewriteText.trim() || annotate.isLoading}
                              onClick={() => mutateEntry(entry, 'rewrite', rewriteText.trim())}
                              className="inline-flex min-h-11 items-center gap-2 bg-life-moss px-3 text-life-sm text-life-paper disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" />
                              {localize('com_life_save')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-life-kai text-life-sm leading-7 text-life-ink">
                            {entry.text}
                          </p>
                          {entry.quote && (
                            <blockquote className="mt-2 border-l-2 border-life-brass/50 pl-3 text-life-meta leading-6 text-life-muted">
                              {entry.quote}
                            </blockquote>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1 border-t border-life-rule pt-2">
                            <button
                              type="button"
                              onClick={() => mutateEntry(entry, 'keep')}
                              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-life-sm text-life-moss"
                            >
                              <Check className="h-4 w-4" />
                              {localize('com_life_dossier_keep')}
                            </button>
                            <button
                              type="button"
                              onClick={() => beginRewrite(entry)}
                              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-life-sm text-life-brass"
                            >
                              <Pencil className="h-4 w-4" />
                              {localize('com_life_dossier_rewrite')}
                            </button>
                            <button
                              type="button"
                              onClick={() => mutateEntry(entry, 'strike')}
                              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-life-sm text-life-cinnabar"
                            >
                              <Trash2 className="h-4 w-4" />
                              {localize('com_life_dossier_strike')}
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  ))}
                </div>
                {error && <p className="mt-3 text-life-sm text-red-600">{error}</p>}
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
