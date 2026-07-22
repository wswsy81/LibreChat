import { useEffect, useState } from 'react';

import { useLocalize } from '~/hooks';

const WRITING_PHASE_DELAY_MS = 6000;

export default function ResponseProgress() {
  const localize = useLocalize();
  const [phase, setPhase] = useState<'thinking' | 'writing'>('thinking');

  useEffect(() => {
    const timer = window.setTimeout(() => setPhase('writing'), WRITING_PHASE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex h-[31px] items-center gap-2 font-life-mono text-life-meta tracking-[0.08em] text-life-muted"
    >
      <span aria-hidden="true" className="h-px w-5 bg-life-cinnabar/60" />
      <span>
        {phase === 'thinking'
          ? localize('com_life_advisor_thinking')
          : localize('com_life_advisor_writing')}
      </span>
    </div>
  );
}
