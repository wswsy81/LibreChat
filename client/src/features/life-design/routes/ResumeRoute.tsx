import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeError, LifeLoading } from '../components/PageState';
import { useLifeResumeMutation } from '~/data-provider';
import { isConsumed, markConsumed } from '../oneShot';
import { useLocalize } from '~/hooks';
import { track } from '~/utils/track';

const MAX_HANDOFF_RETRIES = 2;
const HANDOFF_RETRY_MS = 1200;

export default function ResumeRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const requested = useRef(false);
  const handoffs = useRef(0);
  const resume = useLifeResumeMutation();

  useEffect(() => {
    if (requested.current) {
      return;
    }
    requested.current = true;
    track('resume_clicked');
    resume.mutate(undefined, {
      onSuccess: (result) => {
        if (result.action === 'new' && result.replayed) {
          if (handoffs.current < MAX_HANDOFF_RETRIES) {
            handoffs.current += 1;
            window.setTimeout(() => {
              requested.current = false;
              resume.reset();
            }, HANDOFF_RETRY_MS);
            return;
          }
          navigate('/home?new=1', { replace: true });
          return;
        }
        if (result.action !== 'new' || !result.operationId) {
          navigate(result.route, { replace: true });
          return;
        }
        const marker = `life:resume:${result.operationId}`;
        if (!isConsumed(marker)) {
          markConsumed(marker);
          navigate(result.route, { replace: true });
          return;
        }
        // Another tab already consumed this auto-submit route; wait for its
        // conversation to appear, then this retry resolves to action=restored.
        if (handoffs.current < MAX_HANDOFF_RETRIES) {
          handoffs.current += 1;
          window.setTimeout(() => {
            requested.current = false;
            resume.reset();
          }, HANDOFF_RETRY_MS);
          return;
        }
        navigate('/home?new=1', { replace: true });
      },
    });
  }, [navigate, resume]);

  if (resume.isError) {
    return (
      <LifeError
        title={localize('com_life_resume_failed')}
        message={localize('com_life_resume_failed_help')}
        onRetry={() => {
          requested.current = false;
          resume.reset();
        }}
        onContinue={() => navigate('/home?new=1')}
      />
    );
  }
  return <LifeLoading />;
}
