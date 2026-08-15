import { useEffect, useMemo, useRef, useState } from 'react';
import { ListTree, X } from 'lucide-react';
import { useMediaQuery } from '@librechat/client';
import type { LifeClaritySnapshot } from 'librechat-data-provider';
import { useLifeClarityQuery } from '~/data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const REFRESH_DELAYS_MS = [500, 1500, 3500];

type ClaritySituationProps = {
  conversationId: string;
  sourceTurnId: string;
  isSubmitting: boolean;
};

function ownershipKey(snapshot: LifeClaritySnapshot): TranslationKeys {
  if (snapshot.ownership === 'user_owned') return 'com_life_clarity_owned';
  if (snapshot.ownership === 'user_stated') return 'com_life_clarity_user_stated';
  return 'com_life_clarity_tentative';
}

export default function ClaritySituation({
  conversationId,
  sourceTurnId,
  isSubmitting,
}: ClaritySituationProps) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousSubmitting = useRef(isSubmitting);
  const previousConversationId = useRef(conversationId);
  const [isOpen, setIsOpen] = useState(false);
  const { data, refetch } = useLifeClarityQuery(conversationId, sourceTurnId, {
    enabled: Boolean(conversationId && sourceTurnId && !isSubmitting),
  });
  const snapshot = useMemo(() => {
    const candidate = data?.snapshot;
    if (!candidate) return null;
    if (candidate.conversationId !== conversationId) return null;
    if (candidate.sourceTurnId !== sourceTurnId) return null;
    return candidate;
  }, [conversationId, data?.snapshot, sourceTurnId]);

  useEffect(() => {
    const wasSubmitting = previousSubmitting.current;
    previousSubmitting.current = isSubmitting;
    if (!wasSubmitting || isSubmitting || !conversationId || !sourceTurnId) return;
    const timers = REFRESH_DELAYS_MS.map((delay) => window.setTimeout(() => void refetch(), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [conversationId, isSubmitting, refetch, sourceTurnId]);

  useEffect(() => {
    if (previousConversationId.current === conversationId) return;
    previousConversationId.current = conversationId;
    setIsOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isSmallScreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isSmallScreen]);

  if (!conversationId || !sourceTurnId) return null;

  let summary = localize('com_life_clarity_trigger');
  if (snapshot?.posture === 'paused') {
    summary = localize('com_life_clarity_summary_paused');
  } else if (snapshot?.remaining.count) {
    summary = localize('com_life_clarity_summary_unknowns', {
      count: snapshot.remaining.count,
    });
  } else if (snapshot?.layers.judgment) {
    summary = localize('com_life_clarity_summary_judgment');
  }

  const close = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls="life-clarity-situation"
        aria-label={localize('com_life_clarity_open')}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          'min-h-11 items-center gap-2 border border-life-rule bg-life-paper px-3 font-life-sans text-life-sm font-medium text-life-ink transition-colors hover:border-life-moss motion-reduce:transition-none',
          isSmallScreen
            ? 'fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-[72] flex max-w-[min(78vw,18rem)] shadow-lg'
            : 'hidden max-w-[22rem] md:flex',
        )}
      >
        <ListTree className="h-4 w-4 shrink-0 text-life-brass" aria-hidden="true" />
        <span className="truncate">{summary}</span>
      </button>

      {isOpen && (
        <button
          type="button"
          aria-label={localize('com_life_clarity_close')}
          className="fixed inset-0 z-[78] bg-life-ink/20 backdrop-blur-[1px]"
          onClick={close}
        />
      )}

      <aside
        id="life-clarity-situation"
        aria-hidden={!isOpen}
        aria-label={localize('com_life_clarity_title')}
        className={cn(
          'fixed z-[80] flex flex-col border-life-rule bg-life-paper shadow-2xl transition-transform duration-300 motion-reduce:transition-none',
          isSmallScreen
            ? 'inset-x-0 bottom-0 h-[72vh] max-h-[44rem] rounded-t-md border-t'
            : 'inset-y-0 right-0 w-[400px] max-w-[min(100vw,400px)] border-l',
          isOpen
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-x-full md:translate-y-0',
        )}
      >
        {isOpen && (
          <>
            <header className="flex items-start justify-between border-b border-life-rule px-5 py-4">
              <div className="min-w-0">
                <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-cinnabar">
                  {localize('com_life_clarity_kicker')}
                </p>
                <h2 className="mt-1 font-life-serif text-life-lead font-semibold text-life-ink">
                  {localize('com_life_clarity_title')}
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex min-h-11 min-w-11 items-center justify-center text-life-muted hover:text-life-ink"
                aria-label={localize('com_life_clarity_close')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8" aria-live="polite">
              {!snapshot && (
                <section className="py-6">
                  <p className="font-life-kai text-life-body leading-8 text-life-muted">
                    {isSubmitting
                      ? localize('com_life_clarity_waiting')
                      : localize('com_life_clarity_empty')}
                  </p>
                </section>
              )}

              {snapshot && (
                <div key={snapshot.revision}>
                  <section className="border-b border-life-rule py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="border border-life-rule px-2 py-1 font-life-mono text-life-meta text-life-brass">
                        {localize(ownershipKey(snapshot))}
                      </span>
                      {snapshot.posture === 'paused' && (
                        <span className="font-life-mono text-life-meta text-life-moss">
                          {localize('com_life_clarity_can_pause')}
                        </span>
                      )}
                    </div>
                    {snapshot.issue && (
                      <p className="mt-3 font-life-serif text-life-body font-semibold leading-8 text-life-ink">
                        {snapshot.issue}
                      </p>
                    )}
                  </section>

                  <section className="border-b border-life-rule py-5">
                    <h3 className="font-life-mono text-life-meta tracking-[0.12em] text-life-cinnabar">
                      {localize('com_life_clarity_judgment')}
                    </h3>
                    <p className="mt-3 max-w-[34em] font-life-kai text-life-body leading-8 text-life-ink">
                      {snapshot.layers.judgment || localize('com_life_clarity_early')}
                    </p>
                  </section>

                  {snapshot.layers.keyUnknowns.length > 0 && (
                    <section className="border-b border-life-rule py-5">
                      <h3 className="font-life-mono text-life-meta tracking-[0.12em] text-life-brass">
                        {localize('com_life_clarity_unknowns')}
                      </h3>
                      <p className="mt-2 text-life-sm leading-7 text-life-muted">
                        {localize('com_life_clarity_remaining', {
                          count: snapshot.remaining.count,
                        })}
                      </p>
                      <ol className="mt-3 space-y-3">
                        {snapshot.layers.keyUnknowns.map((unknown, index) => (
                          <li
                            key={`${snapshot.revision}:${index}`}
                            className="grid grid-cols-[1.5rem_1fr] gap-2 text-life-sm leading-7 text-life-ink"
                          >
                            <span className="font-life-mono text-life-meta text-life-brass">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span>{unknown}</span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {snapshot.layers.whyNotConverged && (
                    <section className="border-b border-life-rule py-5">
                      <h3 className="font-life-mono text-life-meta tracking-[0.12em] text-life-brass">
                        {localize('com_life_clarity_why_continue')}
                      </h3>
                      <p className="mt-3 text-life-sm leading-7 text-life-muted">
                        {snapshot.layers.whyNotConverged}
                      </p>
                    </section>
                  )}

                  <p className="py-5 font-life-kai text-life-sm leading-7 text-life-muted">
                    {localize('com_life_clarity_privacy_control')}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
