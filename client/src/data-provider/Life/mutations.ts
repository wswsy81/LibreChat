import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  LifeMapHouseAnnotateRequest,
  LifeMapHouseAnnotateResponse,
  LifeConditionCandidateResolveRequest,
  LifeConditionCandidateResolveResponse,
  LifeBasicsRequest,
  LifeBasicsResponse,
  LifeBirthInfo,
  LifeBirthResponse,
  LifeDossierAnnotateRequest,
  LifeDossierAnnotateResponse,
  LifeSelfChapterItem,
  LifeSelfProjectionResponse,
  LifeOnboardingRequest,
  LifeOnboardingResponse,
  LifeResumeResponse,
  LifeShareResponse,
  LifeStanceFeedbackRequest,
  LifeStanceFeedbackResponse,
} from 'librechat-data-provider';

const DOSSIER_ANNOTATE_TIMEOUT_MS = 8_000;
const DOSSIER_RECONCILE_TIMEOUT_MS = 5_000;

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('life dossier request timed out')), timeoutMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timeout));
};

const findDossierItem = (
  projection: LifeSelfProjectionResponse,
  payload: LifeDossierAnnotateRequest,
): LifeSelfChapterItem | undefined =>
  Object.values(projection.projection.chapters)
    .flat()
    .find(
      (item) =>
        item.dossierRef?.section === payload.section && item.dossierRef.entryId === payload.entryId,
    );

const annotationWasApplied = (
  projection: LifeSelfProjectionResponse,
  payload: LifeDossierAnnotateRequest,
) => {
  const item = findDossierItem(projection, payload);
  if (payload.action === 'keep') return item?.status === 'confirmed';
  if (payload.action === 'rewrite') {
    return item?.status === 'user_rewrite' && item.text === payload.text?.trim();
  }
  return item == null;
};

const reconciledAnnotation = (
  payload: LifeDossierAnnotateRequest,
): LifeDossierAnnotateResponse => ({
  ok: true,
  entry: {
    id: payload.entryId,
    status:
      payload.action === 'keep'
        ? 'confirmed'
        : payload.action === 'rewrite'
          ? 'edited'
          : payload.action === 'strike'
            ? 'dismissed'
            : 'merged',
  },
});

export async function annotateLifeDossierWithReconciliation(
  payload: LifeDossierAnnotateRequest,
  requestTimeoutMs = DOSSIER_ANNOTATE_TIMEOUT_MS,
  reconcileTimeoutMs = DOSSIER_RECONCILE_TIMEOUT_MS,
): Promise<LifeDossierAnnotateResponse> {
  try {
    return await withTimeout(dataService.annotateLifeDossier(payload), requestTimeoutMs);
  } catch (error) {
    const projection = await withTimeout(
      dataService.getLifeSelfProjection(),
      reconcileTimeoutMs,
    ).catch(() => null);
    if (projection && annotationWasApplied(projection, payload)) {
      return reconciledAnnotation(payload);
    }
    throw error;
  }
}

export interface LifeStanceFeedbackVariables {
  reportId: string;
  payload: LifeStanceFeedbackRequest;
  idempotencyKey: string;
}

export const useLifeOnboardingMutation = (): UseMutationResult<
  LifeOnboardingResponse,
  Error,
  LifeOnboardingRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(dataService.createLifeOnboarding, {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
    },
  });
};

export const useLifeResumeMutation = (): UseMutationResult<LifeResumeResponse, Error, void> =>
  useMutation(() => dataService.resumeLifeConversation());

export const useLifeShareMutation = (): UseMutationResult<
  LifeShareResponse,
  Error,
  { reportId: string; expiresAt: string | null }
> => useMutation(({ reportId, expiresAt }) => dataService.createLifeShare(reportId, expiresAt));

export const useLifeStanceFeedbackMutation = (): UseMutationResult<
  LifeStanceFeedbackResponse,
  Error,
  LifeStanceFeedbackVariables
> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ reportId, payload, idempotencyKey }: LifeStanceFeedbackVariables) =>
      dataService.submitLifeStanceFeedback(reportId, payload, idempotencyKey),
    {
      onSuccess: (_result, { reportId }) => {
        queryClient.invalidateQueries([QueryKeys.lifeReport, reportId]);
      },
    },
  );
};

export const useLifeHtmlExportMutation = (): UseMutationResult<string, Error, string> =>
  useMutation((reportId) => dataService.getLifeReportHtml(reportId));

export const useLifePrintMutation = (): UseMutationResult<string, Error, string> =>
  useMutation((reportId) => dataService.getLifeReportPrint(reportId));

export const useLifeDossierAnnotateMutation = (): UseMutationResult<
  LifeDossierAnnotateResponse,
  Error,
  LifeDossierAnnotateRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(annotateLifeDossierWithReconciliation, {
    onSettled: () => {
      queryClient.invalidateQueries([QueryKeys.lifeDossierHtml]);
      queryClient.invalidateQueries([QueryKeys.lifeMapHtml]);
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
      queryClient.invalidateQueries([QueryKeys.lifeSelfProjection]);
      queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
    },
  });
};

export const useLifeBasicsMutation = (): UseMutationResult<
  LifeBasicsResponse,
  Error,
  LifeBasicsRequest
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: LifeBasicsRequest) => dataService.saveLifeBasics(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
      queryClient.invalidateQueries([QueryKeys.lifeSelfProjection]);
    },
  });
};

export const useLifeBirthMutation = (): UseMutationResult<
  LifeBirthResponse,
  Error,
  LifeBirthInfo
> => {
  const queryClient = useQueryClient();
  return useMutation((payload: LifeBirthInfo) => dataService.saveLifeBirth(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
      queryClient.invalidateQueries([QueryKeys.lifeMapHtml]);
      queryClient.invalidateQueries([QueryKeys.lifeSelfProjection]);
    },
  });
};

export const useLifeMapHouseAnnotateMutation = (): UseMutationResult<
  LifeMapHouseAnnotateResponse,
  Error,
  LifeMapHouseAnnotateRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: LifeMapHouseAnnotateRequest) => dataService.annotateLifeMapHouse(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.lifeMapHtml]);
        queryClient.invalidateQueries([QueryKeys.lifeDossierHtml]);
        queryClient.invalidateQueries([QueryKeys.lifeArchive]);
        queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
      },
    },
  );
};

export const useLifeConditionCandidateResolveMutation = (): UseMutationResult<
  LifeConditionCandidateResolveResponse,
  Error,
  LifeConditionCandidateResolveRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: LifeConditionCandidateResolveRequest) =>
      dataService.resolveLifeConditionCandidate(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
        queryClient.invalidateQueries([QueryKeys.lifeArchive]);
        queryClient.invalidateQueries([QueryKeys.lifeSelfProjection]);
        queryClient.invalidateQueries([QueryKeys.lifeMapHtml]);
      },
    },
  );
};
