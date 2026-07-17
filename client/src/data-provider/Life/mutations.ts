import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  LifeMapHouseAnnotateRequest,
  LifeMapHouseAnnotateResponse,
  LifeBasicsRequest,
  LifeBasicsResponse,
  LifeBirthInfo,
  LifeBirthResponse,
  LifeDossierAnnotateRequest,
  LifeDossierAnnotateResponse,
  LifeInboxCreateResponse,
  LifeDiagnosticRequest,
  LifeDiagnosticResponse,
  LifeOnboardingRequest,
  LifeOnboardingResponse,
  LifeResumeResponse,
  LifeShareResponse,
} from 'librechat-data-provider';

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

export const useLifeDiagnosticMutation = (): UseMutationResult<
  LifeDiagnosticResponse,
  Error,
  LifeDiagnosticRequest
> => {
  const queryClient = useQueryClient();
  return useMutation(dataService.createLifeDiagnostic, {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.lifeBootstrap]);
      queryClient.invalidateQueries([QueryKeys.lifeArchive]);
    },
  });
};

export const useLifeResumeMutation = (): UseMutationResult<LifeResumeResponse, Error, void> =>
  useMutation(() => dataService.resumeLifeConversation());

export const useLifeInboxMutation = (): UseMutationResult<
  LifeInboxCreateResponse,
  Error,
  string
> => {
  const queryClient = useQueryClient();
  return useMutation((text: string) => dataService.createLifeInboxEntry(text), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.lifeInbox]);
    },
  });
};

export const useLifeShareMutation = (): UseMutationResult<
  LifeShareResponse,
  Error,
  { reportId: string; expiresAt: string | null }
> => useMutation(({ reportId, expiresAt }) => dataService.createLifeShare(reportId, expiresAt));

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
  return useMutation(
    (payload: LifeDossierAnnotateRequest) => dataService.annotateLifeDossier(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.lifeDossierHtml]);
        queryClient.invalidateQueries([QueryKeys.lifeMapHtml]);
        queryClient.invalidateQueries([QueryKeys.lifeArchive]);
      },
    },
  );
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
      },
    },
  );
};
