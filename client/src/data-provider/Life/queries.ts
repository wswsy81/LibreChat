import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type {
  LifeArchiveResponse,
  LifeBootstrapResponse,
  LifeInboxListResponse,
  LifePublicShareResponse,
  LifeReportResponse,
} from 'librechat-data-provider';

export const useLifeBootstrapQuery = (
  config?: UseQueryOptions<LifeBootstrapResponse>,
): QueryObserverResult<LifeBootstrapResponse> =>
  useQuery<LifeBootstrapResponse>([QueryKeys.lifeBootstrap], dataService.getLifeBootstrap, {
    staleTime: 30_000,
    cacheTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    ...config,
  });

export const useLifeArchiveQuery = (
  config?: UseQueryOptions<LifeArchiveResponse>,
): QueryObserverResult<LifeArchiveResponse> =>
  useQuery<LifeArchiveResponse>([QueryKeys.lifeArchive], dataService.getLifeArchive, {
    staleTime: 30_000,
    cacheTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    ...config,
  });

export const useLifeInboxQuery = (
  config?: UseQueryOptions<LifeInboxListResponse>,
): QueryObserverResult<LifeInboxListResponse> =>
  useQuery<LifeInboxListResponse>([QueryKeys.lifeInbox], dataService.getLifeInbox, {
    staleTime: 15_000,
    cacheTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    ...config,
  });

export const useLifeReportQuery = (
  reportId: string,
  config?: UseQueryOptions<LifeReportResponse>,
): QueryObserverResult<LifeReportResponse> =>
  useQuery<LifeReportResponse>(
    [QueryKeys.lifeReport, reportId],
    () => dataService.getLifeReport(reportId),
    { enabled: Boolean(reportId), retry: false, ...config },
  );

export const useLifeReportHtmlQuery = (
  reportId: string,
  config?: UseQueryOptions<string>,
): QueryObserverResult<string> =>
  useQuery<string>(
    [QueryKeys.lifeReportHtml, reportId],
    () => dataService.getLifeReportHtml(reportId),
    { enabled: Boolean(reportId), retry: false, cacheTime: 0, staleTime: 0, ...config },
  );

export const useLifeDossierHtmlQuery = (
  revision: boolean,
  config?: UseQueryOptions<string>,
): QueryObserverResult<string> =>
  useQuery<string>(
    [QueryKeys.lifeDossierHtml, revision],
    () => dataService.getLifeDossierHtml(revision),
    { retry: 1, cacheTime: 0, staleTime: 0, refetchOnWindowFocus: false, ...config },
  );

export const useLifeMapHtmlQuery = (
  config?: UseQueryOptions<string>,
): QueryObserverResult<string> =>
  useQuery<string>([QueryKeys.lifeMapHtml], dataService.getLifeMapHtml, {
    retry: 1,
    cacheTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    ...config,
  });

export const useLifeShareQuery = (
  token: string,
  config?: UseQueryOptions<LifePublicShareResponse>,
): QueryObserverResult<LifePublicShareResponse> =>
  useQuery<LifePublicShareResponse>(
    [QueryKeys.lifeShare, token],
    () => dataService.getLifeShare(token),
    { enabled: Boolean(token), retry: false, cacheTime: 0, staleTime: 0, ...config },
  );
