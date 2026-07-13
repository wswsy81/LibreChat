import { useGetStartupConfig } from '~/data-provider';

/** Reads the LIFE_UNIFIED_SHELL feature flag from startup config (default on). */
export default function useUnifiedShell(): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useGetStartupConfig();
  return { enabled: data?.lifeUnifiedShell !== false, isLoading: isLoading && data == null };
}
