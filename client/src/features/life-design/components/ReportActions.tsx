import { useState } from 'react';
import { Download, MessageCircleMore, Printer, Share2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@librechat/client';
import {
  useLifeHtmlExportMutation,
  useLifePrintMutation,
  useLifeShareMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

const safeName = (value: string) =>
  (value || '人生存档报告')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .slice(0, 80) || '人生存档报告';

export default function ReportActions({ reportId, title }: { reportId: string; title: string }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const htmlExport = useLifeHtmlExportMutation();
  const printReport = useLifePrintMutation();
  const share = useLifeShareMutation();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [expiry, setExpiry] = useState<'never' | '7' | '30'>('never');
  const [copied, setCopied] = useState(false);

  const downloadHtml = () => {
    htmlExport.mutate(reportId, {
      onSuccess: (html) => {
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${safeName(title)}.html`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      },
    });
  };

  const printHtml = () => {
    printReport.mutate(reportId, {
      onSuccess: (html) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '1px';
        frame.style.height = '1px';
        frame.style.opacity = '0';
        frame.onload = () => {
          window.setTimeout(() => {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            window.setTimeout(() => frame.remove(), 1_000);
          }, 150);
        };
        frame.srcdoc = html;
        document.body.appendChild(frame);
      },
    });
  };

  const createShare = () => {
    if (!confirmed || share.isLoading) {
      return;
    }
    const days = expiry === 'never' ? 0 : Number(expiry);
    const expiresAt = days
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString()
      : null;
    share.mutate(
      { reportId, expiresAt },
      {
        onSuccess: async (result) => {
          const url = `${window.location.origin}${result.shareUrl}`;
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        },
      },
    );
  };

  const shareUrl = share.data ? `${window.location.origin}${share.data.shareUrl}` : '';
  const hasError = htmlExport.isError || printReport.isError || share.isError;

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label={localize('com_life_report_actions')}
      >
        <Button
          type="button"
          data-testid="life-report-continue"
          className="min-h-11 rounded-[4px] bg-life-moss px-4 font-life-sans text-life-paper hover:bg-life-moss-deep"
          onClick={() => navigate('/resume')}
        >
          <MessageCircleMore className="h-4 w-4" aria-hidden="true" />
          {localize('com_life_continue_with_report')}
        </Button>
        <Button
          type="button"
          data-testid="life-report-share"
          variant="outline"
          className="min-h-11 min-w-11 rounded-[4px] border-life-rule bg-transparent px-3 font-life-sans text-life-ink hover:bg-life-paper-deep dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10"
          aria-label={localize('com_life_share')}
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{localize('com_life_share')}</span>
        </Button>
        <Button
          type="button"
          data-testid="life-report-download"
          variant="outline"
          className="min-h-11 min-w-11 rounded-[4px] border-life-rule bg-transparent px-3 font-life-sans text-life-ink hover:bg-life-paper-deep dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10"
          disabled={htmlExport.isLoading}
          aria-label={
            htmlExport.isLoading
              ? localize('com_life_preparing')
              : localize('com_life_download_html')
          }
          onClick={downloadHtml}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">
            {htmlExport.isLoading
              ? localize('com_life_preparing')
              : localize('com_life_download_html')}
          </span>
        </Button>
        <Button
          type="button"
          data-testid="life-report-print"
          variant="outline"
          className="min-h-11 min-w-11 rounded-[4px] border-life-rule bg-transparent px-3 font-life-sans text-life-ink hover:bg-life-paper-deep dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10"
          disabled={printReport.isLoading}
          aria-label={
            printReport.isLoading ? localize('com_life_preparing') : localize('com_life_save_pdf')
          }
          onClick={printHtml}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">
            {printReport.isLoading ? localize('com_life_preparing') : localize('com_life_save_pdf')}
          </span>
        </Button>
      </div>
      {hasError && (
        <p role="alert" className="mt-2 text-sm text-life-cinnabar dark:text-[#D98A76]">
          {localize('com_life_report_action_failed')}
        </p>
      )}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[6px] border border-life-rule bg-life-paper p-6 text-life-ink shadow-2xl dark:border-white/15 dark:bg-surface-primary dark:text-gray-100 sm:rounded-[6px] sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium tracking-[0.16em] text-life-cinnabar dark:text-[#D98A76]">
                  {localize('com_life_public_link')}
                </p>
                <h2
                  id="share-dialog-title"
                  className="mt-2 font-life-serif text-2xl font-semibold text-life-ink dark:text-gray-100"
                >
                  {localize('com_life_share_report_title')}
                </h2>
              </div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-[4px] text-life-muted hover:bg-life-paper-deep hover:text-life-ink dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100"
                onClick={() => setShareOpen(false)}
                aria-label={localize('com_life_close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 border-y border-life-cinnabar/30 bg-life-cinnabar/5 px-1 py-4 text-sm leading-7 text-life-muted dark:bg-life-cinnabar/10 dark:text-gray-300">
              <p className="font-medium text-life-ink dark:text-gray-100">
                {localize('com_life_share_preview_title')}
              </p>
              <p className="mt-2">{localize('com_life_share_preview_help')}</p>
              <p className="mt-2 font-medium text-life-cinnabar dark:text-[#D98A76]">{title}</p>
            </div>

            {!share.data && (
              <>
                <label className="mt-5 block text-sm font-medium text-life-ink dark:text-gray-100">
                  {localize('com_life_share_expiry')}
                  <select
                    value={expiry}
                    onChange={(event) => setExpiry(event.target.value as 'never' | '7' | '30')}
                    className="mt-2 h-11 w-full rounded-[4px] border border-life-rule bg-life-paper-deep px-3 text-life-ink dark:border-white/15 dark:bg-surface-secondary dark:text-gray-100"
                  >
                    <option value="never">{localize('com_life_share_never')}</option>
                    <option value="7">{localize('com_life_share_7_days')}</option>
                    <option value="30">{localize('com_life_share_30_days')}</option>
                  </select>
                </label>
                <label className="mt-5 flex cursor-pointer items-start gap-3 border border-life-rule bg-transparent p-4 dark:border-white/15">
                  <input
                    type="checkbox"
                    data-testid="life-share-confirm"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    className="mt-1 h-5 w-5 accent-life-moss"
                  />
                  <span className="text-sm leading-7 text-life-ink dark:text-gray-100">
                    {localize('com_life_share_confirm')}
                  </span>
                </label>
                <Button
                  type="button"
                  data-testid="life-share-create"
                  disabled={!confirmed || share.isLoading}
                  className="mt-5 min-h-12 w-full rounded-[4px] bg-life-moss font-life-sans text-life-paper hover:bg-life-moss-deep"
                  onClick={createShare}
                >
                  {share.isLoading
                    ? localize('com_life_creating_link')
                    : localize('com_life_create_and_copy')}
                </Button>
              </>
            )}

            {shareUrl && (
              <div className="mt-5">
                <label
                  className="text-sm font-medium text-life-ink dark:text-gray-100"
                  htmlFor="life-share-url"
                >
                  {copied
                    ? localize('com_life_link_copied')
                    : localize('com_life_copy_link_manually')}
                </label>
                <input
                  id="life-share-url"
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-2 h-11 w-full rounded-[4px] border border-life-rule bg-life-paper-deep px-3 text-sm text-life-ink dark:border-white/15 dark:bg-surface-secondary dark:text-gray-100"
                />
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
