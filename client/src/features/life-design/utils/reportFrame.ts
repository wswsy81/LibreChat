const MIN_REPORT_HEIGHT = 640;
const MAX_REPORT_HEIGHT = 48_000;

export function applyLifeReportTheme(html: string, dark: boolean) {
  const attribute = `data-life-theme="${dark ? 'dark' : 'light'}"`;
  return String(html || '').replace(/<html([^>]*)>/i, (_match, attributes: string) => {
    const nextAttributes = attributes.replace(/\sdata-life-theme=(['"])[^'"]*\1/i, '');
    return `<html${nextAttributes} ${attribute}>`;
  });
}

export function reportThemeIsDark(theme: string, systemDark: boolean) {
  return theme === 'system' ? systemDark : theme === 'dark';
}

export function reportHeightFromMessage(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const message = data as { type?: unknown; payload?: { height?: unknown } };
  if (message.type !== 'ui-size-change') return null;
  const height = Number(message.payload?.height);
  if (!Number.isFinite(height) || height <= 0) return null;
  return Math.min(MAX_REPORT_HEIGHT, Math.max(MIN_REPORT_HEIGHT, Math.ceil(height)));
}
