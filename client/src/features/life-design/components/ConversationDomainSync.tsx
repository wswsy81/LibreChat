import { useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';
import { useLifeBootstrapQuery, useLifeOnboardingMutation } from '~/data-provider';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';

export default function ConversationDomainSync() {
  const match = useMatch('/c/:conversationId');
  const conversationId = match?.params.conversationId ?? null;
  const { isAuthenticated, user } = useAuthContext();
  const localize = useLocalize();
  const shell = useUnifiedShell();
  const bootstrap = useLifeBootstrapQuery({
    enabled: isAuthenticated && shell.enabled && !shell.isLoading && Boolean(conversationId),
  });
  const onboarding = useLifeOnboardingMutation();
  const attemptedConversation = useRef<string | null>(null);

  useEffect(() => {
    attemptedConversation.current = null;
  }, [conversationId]);

  const domain = bootstrap.data?.domainConversations?.find(
    (item) => item.conversationId === conversationId,
  );

  useEffect(() => {
    if (!conversationId || !domain || onboarding.isLoading) {
      return;
    }
    if (bootstrap.data?.activeHouse === domain.entryHouse) {
      return;
    }
    if (attemptedConversation.current === conversationId) {
      return;
    }
    attemptedConversation.current = conversationId;
    onboarding.mutate({
      archiveName: bootstrap.data?.summary?.alias || user?.name || localize('com_life_my_archive'),
      entryHouse: domain.entryHouse,
    });
  }, [
    bootstrap.data?.activeHouse,
    bootstrap.data?.summary?.alias,
    conversationId,
    domain,
    localize,
    onboarding,
    user?.name,
  ]);

  return null;
}
