import { formatLifeDate, formatLifeTimelineWhen } from './date';

describe('life-design date formatting', () => {
  it('formats valid timestamps', () => {
    expect(
      formatLifeDate('2026-07-17T01:30:39.981Z', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
      }),
    ).toBe('2026/07/17');
  });

  it('uses the fallback for missing or invalid machine timestamps', () => {
    expect(formatLifeDate(null, { dateStyle: 'medium' })).toBe('—');
    expect(formatLifeDate('not-a-date', { dateStyle: 'medium' }, '')).toBe('');
  });

  it('preserves natural-language timeline labels instead of treating them as dates', () => {
    expect(formatLifeTimelineWhen('两周前至今', { month: '2-digit', day: '2-digit' })).toBe(
      '两周前至今',
    );
  });
});
