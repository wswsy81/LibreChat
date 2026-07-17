export function formatLifeDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = '—',
): string {
  const text = value?.trim();
  if (!text) {
    return fallback;
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat('zh-CN', options).format(parsed);
}

export function formatLifeTimelineWhen(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const text = value?.trim();
  if (!text) {
    return '—';
  }

  return formatLifeDate(text, options, text);
}
