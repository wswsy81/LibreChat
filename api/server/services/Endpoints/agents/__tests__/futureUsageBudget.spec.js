const { getFutureUsageBudget } = require('../futureUsageBudget');

describe('future-lines usage budget configuration', () => {
  test('邀请测试期默认关闭，保留普通多工具回合', () => {
    expect(getFutureUsageBudget('future-lines', {})).toBeNull();
    expect(
      getFutureUsageBudget('future-lines', { FUTURE_LINES_USAGE_BUDGET_ENABLED: 'false' }),
    ).toBeNull();
  });

  test('只有显式 true 才恢复原有保护线', () => {
    expect(
      getFutureUsageBudget('future-lines', { FUTURE_LINES_USAGE_BUDGET_ENABLED: 'true' }),
    ).toEqual({
      softUsd: 2.25,
      maxUsd: 3,
      maxInputTokens: 36_000,
      maxOutputTokens: 4_000,
      softChapterUsd: 7,
      maxChapterUsd: 9,
      maxChapterInputTokens: 108_000,
      maxChapterOutputTokens: 12_000,
    });
  });

  test('开启后仍接受原有阈值覆盖，非法值回落默认值', () => {
    expect(
      getFutureUsageBudget('future-lines', {
        FUTURE_LINES_USAGE_BUDGET_ENABLED: 'true',
        FUTURE_LINES_TURN_MAX_USD: '8.5',
        FUTURE_LINES_TURN_MAX_INPUT_TOKENS: '0',
      }),
    ).toEqual(
      expect.objectContaining({
        maxUsd: 8.5,
        maxInputTokens: 36_000,
      }),
    );
  });

  test('不影响其他 model spec', () => {
    expect(
      getFutureUsageBudget('another-spec', { FUTURE_LINES_USAGE_BUDGET_ENABLED: 'true' }),
    ).toBeNull();
  });
});
