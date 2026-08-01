import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LifeOnboardingRequest } from 'librechat-data-provider';
import { useLifeOnboardingMutation } from '~/data-provider';
import { isConsumed, markConsumed } from '../oneShot';
import { clearStoredEntryHouse } from '../entry';
import { track } from '~/utils/track';

const MAX_HANDOFF_RETRIES = 3;
const HANDOFF_RETRY_MS = 900;

export default function useHouseEntry() {
  const navigate = useNavigate();
  const onboarding = useLifeOnboardingMutation();
  const handoffs = useRef(0);
  const handoffTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(handoffTimer.current), []);

  const submitEntry = (payload: LifeOnboardingRequest) => {
    onboarding.mutate(payload, {
      onSuccess: (result) => {
        if (result.action === 'new' && result.replayed) {
          if (handoffs.current < MAX_HANDOFF_RETRIES) {
            handoffs.current += 1;
            handoffTimer.current = window.setTimeout(() => submitEntry(payload), HANDOFF_RETRY_MS);
            return;
          }
          navigate('/resume', { replace: true });
          return;
        }
        clearStoredEntryHouse();
        if (result.entryEvent.visitMode !== 'first_entry') {
          track('house_reentered', {
            house: result.entryEvent.entryHouse,
            visitMode: result.entryEvent.visitMode,
          });
        }
        if (result.action === 'new' && result.operationId) {
          const marker = `life:onboarding:${result.operationId}`;
          if (isConsumed(marker)) {
            navigate('/', { replace: true });
            return;
          }
          markConsumed(marker);
        }
        navigate(result.route, { replace: true });
      },
    });
  };

  const enterHouse = (payload: LifeOnboardingRequest) => {
    window.clearTimeout(handoffTimer.current);
    handoffs.current = 0;
    submitEntry(payload);
  };

  return {
    enterHouse,
    error: onboarding.error,
    isLoading: onboarding.isLoading,
  };
}
