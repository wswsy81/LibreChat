import { useLocalize } from '~/hooks';
import { TStartupConfig } from 'librechat-data-provider';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  if (!startupConfig) {
    return null;
  }
  const privacyPolicy = startupConfig.interface?.privacyPolicy;
  const termsOfService = startupConfig.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className="text-sm text-life-cinnabar underline decoration-transparent transition-all duration-200 hover:text-life-cinnabar-deep hover:decoration-life-cinnabar-deep focus:text-life-cinnabar-deep focus:decoration-life-cinnabar-deep dark:text-[#D98A76] dark:hover:text-[#E8A794] dark:hover:decoration-[#E8A794] dark:focus:text-[#E8A794] dark:focus:decoration-[#E8A794]"
      href={privacyPolicy.externalUrl}
      // Removed for WCAG compliance
      // target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl && (
    <a
      className="text-sm text-life-cinnabar underline decoration-transparent transition-all duration-200 hover:text-life-cinnabar-deep hover:decoration-life-cinnabar-deep focus:text-life-cinnabar-deep focus:decoration-life-cinnabar-deep dark:text-[#D98A76] dark:hover:text-[#E8A794] dark:hover:decoration-[#E8A794] dark:focus:text-[#E8A794] dark:focus:decoration-[#E8A794]"
      href={termsOfService.externalUrl}
      // Removed for WCAG compliance
      // target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  return (
    <div className="align-end m-4 flex justify-center gap-2" role="contentinfo">
      {privacyPolicyRender}
      {privacyPolicyRender && termsOfServiceRender && (
        <div className="border-r-[1px] border-gray-300 dark:border-gray-600" />
      )}
      {termsOfServiceRender}
    </div>
  );
}

export default Footer;
