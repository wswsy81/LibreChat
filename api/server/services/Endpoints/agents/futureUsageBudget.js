function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Invitation testing keeps the implementation available without interrupting
 * normal multi-call tool turns. Re-enable explicitly once production usage
 * volume makes a hard cost stop desirable again.
 */
function getFutureUsageBudget(spec, env = process.env) {
  if (spec !== 'future-lines' || env.FUTURE_LINES_USAGE_BUDGET_ENABLED !== 'true') {
    return null;
  }

  return {
    softUsd: positiveNumber(env.FUTURE_LINES_TURN_SOFT_USD, 2.25),
    maxUsd: positiveNumber(env.FUTURE_LINES_TURN_MAX_USD, 3),
    maxInputTokens: positiveNumber(env.FUTURE_LINES_TURN_MAX_INPUT_TOKENS, 36_000),
    maxOutputTokens: positiveNumber(env.FUTURE_LINES_TURN_MAX_OUTPUT_TOKENS, 4_000),
    softChapterUsd: positiveNumber(env.FUTURE_LINES_CHAPTER_SOFT_USD, 7),
    maxChapterUsd: positiveNumber(env.FUTURE_LINES_CHAPTER_MAX_USD, 9),
    maxChapterInputTokens: positiveNumber(env.FUTURE_LINES_CHAPTER_MAX_INPUT_TOKENS, 108_000),
    maxChapterOutputTokens: positiveNumber(env.FUTURE_LINES_CHAPTER_MAX_OUTPUT_TOKENS, 12_000),
  };
}

module.exports = { getFutureUsageBudget };
