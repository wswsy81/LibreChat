const fs = require('node:fs');
const path = require('node:path');

const { BudgetedModelEndHandler, summarizeUsageBudget } = require('../callbacks');

const endpointTokenConfig = {
  'gpt-5.6-sol': { prompt: 75, completion: 600, context: 400000 },
};
const usageCost = {
  pricing: {
    getMultiplier: ({ model, tokenType, endpointTokenConfig: config }) =>
      config?.[model]?.[tokenType] ?? 0,
    getCacheMultiplier: () => null,
  },
  endpointTokenConfig,
};
const budget = {
  softUsd: 2.25,
  maxUsd: 3,
  maxInputTokens: 36_000,
  maxOutputTokens: 4_000,
  softChapterUsd: 7,
  maxChapterUsd: 9,
  maxChapterInputTokens: 108_000,
  maxChapterOutputTokens: 12_000,
};
const call = {
  model: 'gpt-5.6-sol',
  input_tokens: 12_000,
  output_tokens: 500,
  total_tokens: 12_500,
};

describe('future-lines usage budget', () => {
  test('按生产价格累计每回合 token 与 USD，达到任一硬线就停', () => {
    const one = summarizeUsageBudget([call], budget, usageCost);
    expect(one.costUsd).toBeCloseTo(1.2, 8);
    expect(one.hardExceeded).toBe(false);

    const three = summarizeUsageBudget([call, call, call], budget, usageCost);
    expect(three.inputTokens).toBe(36_000);
    expect(three.costUsd).toBeCloseTo(3.6, 8);
    expect(three.chapterCostUsd).toBeCloseTo(3.6, 8);
    expect(three.softExceeded).toBe(true);
    expect(three.hardExceeded).toBe(true);
    expect(three.hardReasons).toEqual(expect.arrayContaining(['input_tokens', 'usd']));

    const chapter = summarizeUsageBudget(
      [call],
      {
        ...budget,
        baselineInputTokens: 100_000,
        baselineOutputTokens: 10_000,
        baselineCostUsd: 8.2,
      },
      usageCost,
    );
    expect(chapter.chapterCostUsd).toBeCloseTo(9.4, 8);
    expect(chapter.hardReasons).toEqual(
      expect.arrayContaining(['chapter_input_tokens', 'chapter_usd']),
    );
  });

  test('生产 model spec 同时锁单次上下文、输出上限与已核实价格', () => {
    const yaml = fs.readFileSync(path.resolve(__dirname, '../../../../../librechat.yaml'), 'utf8');
    expect(yaml).toMatch(/gpt-5\.6-sol:\s*\n\s+prompt: 75\s*\n\s+completion: 600/);
    const maxContextTokens = Number(yaml.match(/maxContextTokens:\s*(\d+)/)?.[1]);
    const measuredStaticInstructionTokens = 18_713;
    expect(maxContextTokens).toBe(32_000);
    expect(maxContextTokens - measuredStaticInstructionTokens).toBeGreaterThanOrEqual(12_000);
    expect(yaml).toMatch(/max_tokens: 1200/);
  });

  test('模型回合结束时立即抛出专用停损信号，已发生 usage 仍完整保留', async () => {
    const collectedUsage = [];
    const handler = new BudgetedModelEndHandler(collectedUsage, null, jest.fn(), budget, usageCost);
    const graph = {
      getAgentContext: () => ({
        provider: 'openai',
        agentId: 'future-lines',
        clientOptions: { model: 'gpt-5.6-sol' },
      }),
    };

    await expect(
      handler.handle(
        'on_chat_model_end',
        {
          output: {
            usage_metadata: {
              input_tokens: 36_000,
              output_tokens: 1_000,
              total_tokens: 37_000,
            },
          },
        },
        { ls_model_name: 'gpt-5.6-sol', run_id: 'run-1', user_id: 'user-1' },
        graph,
      ),
    ).rejects.toMatchObject({
      code: 'FUTURE_USAGE_BUDGET_EXCEEDED',
      userMessage: expect.stringContaining('成本保护线'),
      budget: expect.objectContaining({ hardExceeded: true }),
    });
    expect(collectedUsage).toHaveLength(1);
    expect(collectedUsage[0]).toEqual(
      expect.objectContaining({
        input_tokens: 36_000,
        output_tokens: 1_000,
      }),
    );
  });

  test('触发硬线后转成用户可继续的中文文本，不落成通用 500 错误', () => {
    const clientSource = fs.readFileSync(path.resolve(__dirname, '../client.js'), 'utf8');
    expect(clientSource).toMatch(/FUTURE_USAGE_BUDGET_EXCEEDED/);
    expect(clientSource).toMatch(/type: ContentTypes\.TEXT/);
    expect(clientSource).toMatch(/err\.userMessage/);
  });
});
