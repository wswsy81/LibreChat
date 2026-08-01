import { parseLifeEntryCard } from './LifeEntryOptions';

describe('parseLifeEntryCard', () => {
  it('removes a valid server-issued card marker and preserves the visible opening', () => {
    const encoded = encodeURIComponent(
      JSON.stringify({
        version: 1,
        entryHouse: 'h6',
        options: [
          { id: 'hentry-h6-b1-1', text: '每天都在忙，说不出忙了什么' },
          { id: 'hentry-h6-b1-2', text: '脑子停不下来，睡也睡不好' },
          { id: 'hentry-h6-b1-3', text: '身体先撑不住了，事还在' },
        ],
        escape: '不想从工作说起也行，先讲件别的。',
      }),
    );
    const result = parseLifeEntryCard(`这块是工作与健康。\n\n<!--life-entry-options:${encoded}-->`);
    expect(result.text).toBe('这块是工作与健康。');
    expect(result.card?.entryHouse).toBe('h6');
    expect(result.card?.options).toHaveLength(3);
  });

  it('leaves malformed markers as ordinary text', () => {
    const text = '开场<!--life-entry-options:not-json-->';
    expect(parseLifeEntryCard(text)).toEqual({ text, card: null });
  });

  it('turns the readable fallback into buttons without leaving an encoded marker in the message', () => {
    const result = parseLifeEntryCard(
      [
        '这块是工作与健康。\n每天忙的这些里，现在最耗你的是哪件？',
        '',
        '工作与健康 · 可以先选一句最像你的：',
        '- 每天都在忙，说不出忙了什么',
        '- 脑子停不下来，睡也睡不好',
        '- 身体先撑不住了，事还在',
        '不想从工作说起也行，先讲件别的。',
      ].join('\n'),
    );

    expect(result.text).toBe('这块是工作与健康。\n每天忙的这些里，现在最耗你的是哪件？');
    expect(result.card?.options.map((option) => option.text)).toEqual([
      '每天都在忙，说不出忙了什么',
      '脑子停不下来，睡也睡不好',
      '身体先撑不住了，事还在',
    ]);
    expect(result.card?.areaLabel).toBe('工作与健康');
    expect(result.card?.escape).toBe('不想从工作说起也行，先讲件别的。');
  });

  it('treats the readable heading as hot copy instead of a hard-coded protocol token', () => {
    const result = parseLifeEntryCard(
      [
        '先说说最近最耗你的那件事。',
        '',
        '写不出来时，挑一句接近的：',
        '- 每天都在忙，说不出忙了什么',
        '- 脑子停不下来，睡也睡不好',
        '- 身体先撑不住了，事还在',
        '也可以直接讲另一件事。',
      ].join('\n'),
    );

    expect(result.text).toBe('先说说最近最耗你的那件事。');
    expect(result.card?.options).toHaveLength(3);
    expect(result.card?.escape).toBe('也可以直接讲另一件事。');
  });
});
