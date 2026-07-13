import { applyLifeReportTheme, reportHeightFromMessage, reportThemeIsDark } from './reportFrame';

describe('applyLifeReportTheme', () => {
  it('adds the current theme to historical report HTML', () => {
    expect(applyLifeReportTheme('<html lang="zh"><body>报告</body></html>', true)).toContain(
      '<html lang="zh" data-life-theme="dark">',
    );
  });

  it('replaces a stale theme instead of duplicating the attribute', () => {
    const result = applyLifeReportTheme(
      '<html lang="zh" data-life-theme="dark"><body>报告</body></html>',
      false,
    );
    expect(result).toContain('data-life-theme="light"');
    expect(result.match(/data-life-theme/g)).toHaveLength(1);
  });
});

describe('reportHeightFromMessage', () => {
  it('accepts the renderer size message and rounds the height', () => {
    expect(reportHeightFromMessage({ type: 'ui-size-change', payload: { height: 1280.2 } })).toBe(
      1281,
    );
  });

  it('clamps hostile or accidental oversized values', () => {
    expect(reportHeightFromMessage({ type: 'ui-size-change', payload: { height: 99 } })).toBe(640);
    expect(reportHeightFromMessage({ type: 'ui-size-change', payload: { height: 99_999 } })).toBe(
      48_000,
    );
  });

  it('ignores unrelated and malformed messages', () => {
    expect(reportHeightFromMessage({ type: 'prompt', payload: { height: 900 } })).toBeNull();
    expect(
      reportHeightFromMessage({ type: 'ui-size-change', payload: { height: 'nope' } }),
    ).toBeNull();
  });
});

describe('reportThemeIsDark', () => {
  it('tracks the system preference only while the theme is set to system', () => {
    expect(reportThemeIsDark('system', true)).toBe(true);
    expect(reportThemeIsDark('system', false)).toBe(false);
    expect(reportThemeIsDark('dark', false)).toBe(true);
    expect(reportThemeIsDark('light', true)).toBe(false);
  });
});
