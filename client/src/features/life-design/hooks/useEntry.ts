import { useNavigate } from 'react-router-dom';
import type { LifeOnboardingRequest } from 'librechat-data-provider';
import { useLifeOnboardingMutation } from '~/data-provider';
import { track } from '~/utils/track';
import { clearStoredEntryHouse } from '../entry';
import { isConsumed, markConsumed } from '../oneShot';

export default function useHouseEntry() {
  const navigate = useNavigate();
  const onboarding = useLifeOnboardingMutation();

  const enterHouse = (payload: LifeOnboardingRequest) => {
    onboarding.mutate(payload, {
      onSuccess: (result) => {
        clearStoredEntryHouse();
        if (result.entryEvent.visitMode !== 'first_entry') {
          track('house_reentered', {
            house: result.entryEvent.entryHouse,
            visitMode: result.entryEvent.visitMode,
          });
        }
        if (result.operationId) {
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

  return {
    enterHouse,
    error: onboarding.error,
    isLoading: onboarding.isLoading,
  };
}
