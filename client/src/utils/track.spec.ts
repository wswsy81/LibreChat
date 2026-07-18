import fs from 'fs';
import path from 'path';

type AnalyticsWindow = {
  lifeAnalyticsBeforeSend?: (
    type: string,
    payload: Record<string, unknown>,
  ) => Record<string, unknown>;
};

describe('life analytics privacy boundary', () => {
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

  test('Umami 自动与手动事件都先抹掉分享、报告和会话标识', () => {
    expect(indexHtml).toContain('data-before-send="lifeAnalyticsBeforeSend"');
    expect(indexHtml).toContain('data-exclude-search="true"');
    expect(indexHtml).toContain('data-exclude-hash="true"');

    const script = indexHtml.match(
      /<script id="life-analytics-sanitizer">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(script).toBeTruthy();

    const analyticsWindow: AnalyticsWindow = {};
    new Function('window', script as string)(analyticsWindow);
    const sanitize = analyticsWindow.lifeAnalyticsBeforeSend;
    expect(sanitize).toBeDefined();

    expect(
      sanitize?.('event', {
        url: 'https://yiweilife.com/s/archive/secret-share-token?utm_source=test#top',
        referrer: 'https://yiweilife.com/archive/reports/private-report-id',
      }),
    ).toEqual({
      url: 'https://yiweilife.com/s/archive/:token',
      referrer: 'https://yiweilife.com/archive/reports/:reportId',
    });

    expect(
      sanitize?.('event', {
        url: 'https://yiweilife.com/c/private-conversation-id',
      }),
    ).toEqual({
      url: 'https://yiweilife.com/c/:conversationId',
    });
  });
});
