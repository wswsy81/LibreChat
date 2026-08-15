import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
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
  previousSourceTurnId: string;
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
  previousSourceTurnId,
  isSubmitting,
}: ClaritySituationProps) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousConversationId = useRef(conversationId);
  const [isOpen, setIsOpen] = useState(false);
  const [acceptedSnapshot, setAcceptedSnapshot] = useState<LifeClaritySnapshot | null>(null);
  const { data, refetch } = useLifeClarityQuery(conversationId, sourceTurnId, {
    enabled: Boolean(conversationId && sourceTurnId && !isSubmitting),
  });
  const exactSnapshot = useMemo(() => {
    const candidate = data?.snapshot;
    if (!candidate) return null;
    if (candidate.conversationId !== conversationId) return null;
    if (candidate.sourceTurnId !== sourceTurnId) return null;
    return candidate;
  }, [conversationId, data?.snapshot, sourceTurnId]);
  const retainedSnapshot = useMemo(() => {
    if (!acceptedSnapshot || acceptedSnapshot.conversationId !== conversationId) return null;
    if (acceptedSnapshot.sourceTurnId === sourceTurnId) return acceptedSnapshot;
    if (acceptedSnapshot.sourceTurnId === previousSourceTurnId) return acceptedSnapshot;
    return null;
  }, [acceptedSnapshot, conversationId, previousSourceTurnId, sourceTurnId]);
  const snapshot = exactSnapshot || retainedSnapshot;
  const isStale = Boolean(snapshot && !exactSnapshot);

  useEffect(() => {
    if (!exactSnapshot) return;
    setAcceptedSnapshot(exactSnapshot);
  }, [exactSnapshot]);

  useEffect(() => {
    if (isSubmitting || exactSnapshot || !conversationId || !sourceTurnId) return;
    const timers = REFRESH_DELAYS_MS.map((delay) => window.setTimeout(() => void refetch(), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [conversationId, exactSnapshot, isSubmitting, refetch, sourceTurnId]);

  useEffect(() => {
    if (previousConversationId.current === conversationId) return;
    previousConversationId.current = conversationId;
    setAcceptedSnapshot(null);
    setIsOpen(false);
  }, [conversationId]);

  if (!conversationId || !sourceTurnId) return null;

  let summary = localize('com_life_clarity_trigger');
  if (isStale) {
    summary = localize('com_life_clarity_summary_updating');
  } else if (snapshot?.posture === 'paused') {
    summary = localize('com_life_clarity_summary_paused');
  } else if (snapshot?.posture === 'resolved') {
    summary = localize('com_life_clarity_summary_resolved');
  } else if (snapshot?.remaining.count) {
    summary = localize('com_life_clarity_summary_unknowns', {
      count: snapshot.remaining.count,
    });
  } else if (snapshot?.layers.judgment) {
    summary = localize('com_life_clarity_summary_judgment');
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={localize('com_life_clarity_open')}
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
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[78] bg-life-ink/20 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          id="life-clarity-situation"
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className={cn(
            'fixed z-[80] flex flex-col border-life-rule bg-life-paper shadow-2xl outline-none',
            isSmallScreen
              ? 'inset-x-0 bottom-0 h-[72vh] max-h-[44rem] rounded-t-md border-t'
              : 'inset-y-0 right-0 w-[400px] max-w-[min(100vw,400px)] border-l',
          )}
        >
          <header className="flex items-start justify-between border-b border-life-rule px-5 py-4">
            <div className="min-w-0">
              <p className="font-life-mono text-life-meta tracking-[0.14em] text-life-cinnabar">
                {localize('com_life_clarity_kicker')}
              </p>
              <DialogPrimitive.Title asChild>
                <h2 className="mt-1 font-life-serif text-life-lead font-semibold text-life-ink">
                  {localize('com_life_clarity_title')}
                </h2>
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                ref={closeButtonRef}
                type="button"
                className="flex min-h-11 min-w-11 items-center justify-center text-life-muted hover:text-life-ink"
                aria-label={localize('com_life_clarity_close')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
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
                    {snapshot.posture === 'resolved' && (
                      <span className="font-life-mono text-life-meta text-life-moss">
                        {localize('com_life_clarity_resolved')}
                      </span>
                    )}
                    {isStale && (
                      <span className="font-life-mono text-life-meta text-life-muted">
                        {localize('com_life_clarity_stale')}
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
