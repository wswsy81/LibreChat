import { useEffect, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { useLifeBootstrapQuery, useLifeOnboardingMutation } from '~/data-provider';
import useUnifiedShell from '../hooks/useUnifiedShell';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';

const MAX_ACTIVATION_RETRIES = 3;
const ACTIVATION_RETRY_MS = 900;

export default function ConversationDomainSync() {
  const match = useMatch('/c/:conversationId');
  const conversationId = match?.params.conversationId ?? null;
  const { isAuthenticated, user } = useAuthContext();
  const localize = useLocalize();
  const shell = useUnifiedShell();
  const bootstrap = useLifeBootstrapQuery({
    enabled: isAuthenticated && shell.enabled && !shell.isLoading && Boolean(conversationId),
  });
  const { isLoading: activationLoading, mutate: activateDomain } = useLifeOnboardingMutation();
  const attemptedConversation = useRef<string | null>(null);
  const inFlightConversation = useRef<string | null>(null);
  const exhaustedConversation = useRef<string | null>(null);
  const activationRetries = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => () => window.clearTimeout(retryTimer.current), []);

  useEffect(() => {
    window.clearTimeout(retryTimer.current);
    attemptedConversation.current = null;
    inFlightConversation.current = null;
    exhaustedConversation.current = null;
    activationRetries.current = 0;
    retryTimer.current = undefined;
  }, [conversationId]);

  const domain = bootstrap.data?.domainConversations?.find(
    (item) => item.conversationId === conversationId,
  );

  useEffect(() => {
    if (!conversationId || !domain || activationLoading) {
      return;
    }
    if (bootstrap.data?.activeHouse === domain.entryHouse) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
      return;
    }
    if (
      attemptedConversation.current === conversationId ||
      inFlightConversation.current === conversationId ||
      exhaustedConversation.current === conversationId ||
      retryTimer.current !== undefined
    ) {
      return;
    }
    inFlightConversation.current = conversationId;
    activateDomain(
      {
        archiveName:
          bootstrap.data?.summary?.alias || user?.name || localize('com_life_my_archive'),
        entryHouse: domain.entryHouse,
      },
      {
        onSuccess: () => {
          if (inFlightConversation.current !== conversationId) return;
          attemptedConversation.current = conversationId;
          inFlightConversation.current = null;
          exhaustedConversation.current = null;
          activationRetries.current = 0;
          window.clearTimeout(retryTimer.current);
          retryTimer.current = undefined;
        },
        onError: () => {
          if (inFlightConversation.current !== conversationId) return;
          inFlightConversation.current = null;
          if (activationRetries.current >= MAX_ACTIVATION_RETRIES) {
            exhaustedConversation.current = conversationId;
            return;
          }
          activationRetries.current += 1;
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = undefined;
            setRetryNonce((value) => value + 1);
          }, ACTIVATION_RETRY_MS);
        },
      },
    );
  }, [
    bootstrap.data?.activeHouse,
    bootstrap.data?.summary?.alias,
    conversationId,
    domain,
    localize,
    activateDomain,
    activationLoading,
    retryNonce,
    user?.name,
  ]);

  return null;
}
