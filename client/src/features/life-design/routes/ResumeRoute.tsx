import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLifeResumeMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { LifeError, LifeLoading } from '../components/PageState';

export default function ResumeRoute() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const requested = useRef(false);
  const resume = useLifeResumeMutation();

  useEffect(() => {
    if (requested.current) {
      return;
    }
    requested.current = true;
    resume.mutate(undefined, {
      onSuccess: (result) => navigate(result.route, { replace: true }),
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
        onContinue={() => navigate('/c/new')}
      />
    );
  }
  return <LifeLoading />;
}
