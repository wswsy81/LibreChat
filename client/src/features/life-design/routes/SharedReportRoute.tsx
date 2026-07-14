import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ThemeContext, useMediaQuery } from '@librechat/client';
import { useLifeShareQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { LifeError, LifeLoading } from '../components/PageState';
import {
  applyLifeReportTheme,
  reportHeightFromMessage,
  reportThemeIsDark,
} from '../utils/reportFrame';

export default function SharedReportRoute() {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = reportThemeIsDark(theme, systemDark);
  const { shareToken = '' } = useParams();
  const share = useLifeShareQuery(shareToken);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(900);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const nextHeight = reportHeightFromMessage(event.data);
      if (nextHeight) setFrameHeight(nextHeight);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const themedHtml = useMemo(
    () => (share.data ? applyLifeReportTheme(share.data.report.html, dark) : ''),
    [dark, share.data],
  );

  if (share.isLoading) {
    return <LifeLoading fullScreen />;
  }
  if (share.isError || !share.data) {
    return (
      <LifeError
        title={localize('com_life_share_expired')}
        message={localize('com_life_share_expired_help')}
        onRetry={() => share.refetch()}
      />
    );
  }

  return (
    <main className="min-h-screen bg-life-paper px-4 py-8 text-life-ink dark:bg-surface-secondary dark:text-gray-100 sm:px-8 sm:py-12">
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-4 border-b border-life-ink/70 pb-7 dark:border-white/30 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-life-mono text-life-meta tracking-[0.2em] text-life-cinnabar dark:text-[#D98A76]">
            {localize('com_life_brand_eyebrow')}
          </p>
          <h1 className="mt-3 max-w-[22em] text-pretty font-life-serif text-life-title font-semibold leading-[1.35] text-life-ink dark:text-gray-100 sm:text-life-display">
            {share.data.report.title}
          </h1>
        </div>
        <p className="font-life-mono text-life-meta tracking-[0.12em] text-life-muted dark:text-[#B4B7B0]">
          {localize('com_life_read_only_share')}
        </p>
      </header>

      <section className="mx-auto mt-8 w-full max-w-5xl border-y border-life-rule dark:border-white/10">
        <iframe
          ref={frameRef}
          data-testid="life-shared-report-frame"
          title={share.data.report.title}
          sandbox="allow-scripts"
          srcDoc={themedHtml}
          style={{ height: frameHeight }}
          className="block w-full border-0 bg-transparent"
        />
      </section>

      <p className="mx-auto mt-6 max-w-5xl text-center font-life-sans text-life-meta leading-6 text-life-muted dark:text-[#B4B7B0]">
        {localize('com_life_shared_boundary')}
      </p>
    </main>
  );
}
