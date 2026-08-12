import { createHash } from 'node:crypto';
import { assertProductPluginSupportedByHost } from 'librechat-data-provider';
import type { RunLLMConfig } from '~/types';
import { mergeHeaders } from '~/utils/headers';
import {
  createProductSnapshot,
  FuturelineProductRunner,
  type ProductAssetVersion,
  type ProductExperiment,
} from './productRuntime';

const FLOW_ID = 'futureline-advisor-mode-route';
const FLOW_VERSION = 'v2';
const ACTION_ID = 'advisor.route';
const SELECT_ACTION_ID = 'advisor.select-mode';
const NODE_ID = 'select-mode';
const ROUTE_ID = 'advisor-gateway-v1';
const ENDPOINT_ID = 'polaris';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PROMPT_CODE_POINTS = 12_000;
const CORE_PROMPT_SLOT = 'advisor.prompt.core';

export type AdvisorMode = 'free_chat' | 'guided_interview' | 'tool_action' | 'report' | 'mingli';

const REPORT_REQUEST_PATTERN =
  /(?:报告|揭晓|三线).{0,12}(?:生成|查看|打开|更新|重跑|导出)|(?:生成|查看|打开|更新|重跑|导出|给我|想看).{0,12}(?:报告|揭晓|三线)/u;
const MINGLI_REQUEST_PATTERN =
  /(?:帮我|请你|我想|想要|我要|用|按|结合|从|拿).{0,8}(?:八字|命理|星盘|占星|紫微|排盘|四柱|大运|流年|对答案)|给我.{0,3}(?:看看?|算算?|排|分析|解读|对照|对一下).{0,8}(?:八字|命理|星盘|占星|紫微|排盘|四柱|大运|流年)|^(?:看看?|算算?|排|分析|解读|对照|对一下).{0,8}(?:八字|命理|星盘|占星|紫微|排盘|四柱|大运|流年)|^(?:八字|命理|星盘|占星|紫微|排盘|四柱)[：:]|(?:八字|命理|星盘|占星|紫微|排盘|四柱|大运|流年).{0,8}(?:帮我|看看?|算算?|排一下|分析|解读|对照|对一下|怎么看|如何看)/u;
const TOOL_REQUEST_PATTERN =
  /(?:帮我|请你|现在)?(?:查一下|搜索|搜一下|联网查|生成图片|画一张|导出|下载|发送消息|发消息|删除|创建提醒|设置提醒)/u;
const MINGLI_EXIT_PATTERN =
  /(?:先|暂时|暂且)?(?:不聊|不看|不算|不排|停止|结束|退出|到这里|到这儿).{0,8}(?:星盘|占星|八字|命理|排盘|这个|这块|了)|(?:换个|换一|切换)(?:个)?(?:话题|问题|方向)|(?:先|暂时|暂且)?(?:不聊|不看|不算|不排)(?:这个|这块)?了/u;

const MODE_DEFINITIONS: Readonly<Record<AdvisorMode, { nodeId: string; promptSlot: string }>> =
  Object.freeze({
    free_chat: Object.freeze({ nodeId: 'route-free-chat', promptSlot: 'advisor.prompt.free-chat' }),
    guided_interview: Object.freeze({
      nodeId: 'route-guided-interview',
      promptSlot: 'advisor.prompt.guided-interview',
    }),
    tool_action: Object.freeze({
      nodeId: 'route-tool-action',
      promptSlot: 'advisor.prompt.tool-action',
    }),
    report: Object.freeze({ nodeId: 'route-report', promptSlot: 'advisor.prompt.report' }),
    mingli: Object.freeze({ nodeId: 'route-mingli', promptSlot: 'advisor.prompt.mingli' }),
  });
const ADVISOR_MODES = Object.freeze(Object.keys(MODE_DEFINITIONS) as AdvisorMode[]);
const PROMPT_SLOTS = Object.freeze([
  CORE_PROMPT_SLOT,
  ...ADVISOR_MODES.map((mode) => MODE_DEFINITIONS[mode].promptSlot),
]);

interface AdvisorRouteRequestBody {
  spec?: string;
  conversationId?: string;
  messageId?: string;
  parentMessageId?: string;
}

interface AdvisorRouteUser {
  id?: string | null;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchRuntimeContract = (url: string, init: RequestInit) => Promise<FetchResponse>;

export interface AdvisorRouteProof {
  endpoint: typeof ENDPOINT_ID;
  mode: AdvisorMode;
  prompts: {
    core: string;
    modeCard: string;
  };
  headers: {
    'X-Futureline-Product-Snapshot': string;
    'X-Futureline-Product-Flow': string;
    'X-Futureline-Product-Run': string;
    'X-Futureline-Product-Effect': string;
    'X-Futureline-Product-Mode': AdvisorMode;
  };
}

export interface PrepareAdvisorRouteOptions {
  fetchImpl?: FetchRuntimeContract;
  enabled?: boolean;
  engineUrl?: string;
  internalToken?: string;
  timeoutMs?: number;
}

function routeContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`advisor product route: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(
  value: unknown,
  keys: string[],
  label: string,
  optional: string[] = [],
): Record<string, unknown> {
  routeContract(isObject(value), `${label} must be an object`);
  const actual = Object.keys(value);
  const missing = keys.filter(
    (key) => !optional.includes(key) && !Object.prototype.hasOwnProperty.call(value, key),
  );
  const unknown = actual.filter((key) => !keys.includes(key));
  routeContract(missing.length === 0 && unknown.length === 0, `${label} fields mismatch`);
  return value;
}

function requiredText(value: unknown, label: string): string {
  routeContract(typeof value === 'string' && value.length > 0, `${label} is required`);
  return value;
}

function advisorMode(value: unknown, label = 'advisor mode'): AdvisorMode {
  routeContract(
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(MODE_DEFINITIONS, value),
    `${label} is invalid`,
  );
  return value as AdvisorMode;
}

function messageRole(value: unknown): string {
  if (!isObject(value)) return '';
  const role = Reflect.get(value, 'role');
  if (typeof role === 'string') return role;
  const getType = Reflect.get(value, '_getType');
  if (typeof getType !== 'function') return '';
  try {
    const type = Reflect.apply(getType, value, []);
    if (type === 'human') return 'user';
    return typeof type === 'string' ? type : '';
  } catch {
    return '';
  }
}

function messageText(value: unknown): string {
  if (!isObject(value)) return '';
  const content = Reflect.get(value, 'content');
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!isObject(part)) return '';
      const text = Reflect.get(part, 'text');
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Deterministic routing only: strong product triggers first, otherwise ordinary chat. */
export function resolveAdvisorMode(messages: readonly unknown[] = []): AdvisorMode {
  let lastMessage: { role: string; text: string } | undefined;
  let userText = '';
  let mingliActive = false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const role = messageRole(messages[index]);
    const text = messageText(messages[index]).trim();
    if (!lastMessage && (role || text)) lastMessage = { role, text };
    if (role !== 'user') continue;
    if (!userText) userText = text;
    if (MINGLI_EXIT_PATTERN.test(text)) break;
    if (MINGLI_REQUEST_PATTERN.test(text)) {
      mingliActive = true;
      break;
    }
  }
  const currentText = lastMessage?.role === 'system' ? lastMessage.text : userText;
  if (
    /\[trigger:(?:house_entered|chapter_continue|onboarding_completed|session_resumed)\]/u.test(
      currentText,
    )
  ) {
    return 'guided_interview';
  }
  if (lastMessage?.role === 'tool') return 'tool_action';
  if (!userText) return 'free_chat';
  if (REPORT_REQUEST_PATTERN.test(userText)) {
    return 'report';
  }
  if (MINGLI_REQUEST_PATTERN.test(userText)) {
    return 'mingli';
  }
  if (TOOL_REQUEST_PATTERN.test(userText)) {
    return 'tool_action';
  }
  if (MINGLI_EXIT_PATTERN.test(userText)) return 'free_chat';
  if (mingliActive) return 'mingli';
  return 'free_chat';
}

function validateAdvisorFlow(value: unknown): unknown {
  const flow = exactKeys(
    value,
    ['schemaVersion', 'id', 'version', 'entry', 'permissions', 'nodes', 'edges'],
    'flow',
  );
  routeContract(
    flow.schemaVersion === 1 &&
      flow.id === FLOW_ID &&
      flow.version === FLOW_VERSION &&
      flow.entry === NODE_ID,
    'flow identity mismatch',
  );
  routeContract(
    Array.isArray(flow.permissions) &&
      flow.permissions.length === 1 &&
      flow.permissions[0] === 'conversation.read',
    'flow permissions mismatch',
  );
  routeContract(
    Array.isArray(flow.nodes) && flow.nodes.length === ADVISOR_MODES.length + 1,
    'flow node count mismatch',
  );
  const selector = exactKeys(flow.nodes[0], ['id', 'actionId', 'input'], 'flow.nodes[0]');
  const selectorInput = exactKeys(selector.input, ['defaultMode'], 'flow.nodes[0].input');
  routeContract(
    selector.id === NODE_ID &&
      selector.actionId === SELECT_ACTION_ID &&
      selectorInput.defaultMode === 'free_chat',
    'flow selector mismatch',
  );
  for (const [index, mode] of ADVISOR_MODES.entries()) {
    const definition = MODE_DEFINITIONS[mode];
    const node = exactKeys(
      flow.nodes[index + 1],
      ['id', 'actionId', 'input'],
      `flow.nodes[${index + 1}]`,
    );
    const input = exactKeys(
      node.input,
      ['route', 'endpoint', 'mode', 'promptSlot'],
      `flow.nodes[${index + 1}].input`,
    );
    routeContract(
      node.id === definition.nodeId && node.actionId === ACTION_ID,
      'flow action mismatch',
    );
    routeContract(
      input.route === ROUTE_ID &&
        input.endpoint === ENDPOINT_ID &&
        input.mode === mode &&
        input.promptSlot === definition.promptSlot,
      'flow target mismatch',
    );
  }
  routeContract(
    Array.isArray(flow.edges) && flow.edges.length === ADVISOR_MODES.length * 2,
    'flow edge count mismatch',
  );
  const conditionalModes = ADVISOR_MODES.filter((mode) => mode !== 'free_chat');
  for (const [index, mode] of conditionalModes.entries()) {
    const edge = exactKeys(flow.edges[index], ['from', 'to', 'when'], `flow.edges[${index}]`);
    const when = exactKeys(edge.when, ['fact', 'op', 'value'], `flow.edges[${index}].when`);
    routeContract(
      edge.from === NODE_ID &&
        edge.to === MODE_DEFINITIONS[mode].nodeId &&
        when.fact === 'requested_mode' &&
        when.op === 'eq' &&
        when.value === mode,
      'flow conditional edge mismatch',
    );
  }
  const fallbackIndex = conditionalModes.length;
  const fallback = exactKeys(
    flow.edges[fallbackIndex],
    ['from', 'to'],
    `flow.edges[${fallbackIndex}]`,
  );
  routeContract(
    fallback.from === NODE_ID && fallback.to === MODE_DEFINITIONS.free_chat.nodeId,
    'flow fallback edge mismatch',
  );
  for (const [index, mode] of ADVISOR_MODES.entries()) {
    const edgeIndex = fallbackIndex + 1 + index;
    const edge = exactKeys(flow.edges[edgeIndex], ['from', 'to'], `flow.edges[${edgeIndex}]`);
    routeContract(
      edge.from === MODE_DEFINITIONS[mode].nodeId && edge.to === 'END',
      'flow terminal edge mismatch',
    );
  }
  return value;
}

function validatePromptContracts(value: unknown): ReadonlyMap<string, string> {
  routeContract(Array.isArray(value), 'contract.prompts must be an array');
  routeContract(value.length === PROMPT_SLOTS.length, 'contract.prompts count mismatch');
  const prompts = new Map<string, string>();
  for (const [index, prompt] of value.entries()) {
    const item = exactKeys(prompt, ['slot', 'sha256', 'content'], `contract.prompts[${index}]`);
    const slot = requiredText(item.slot, `contract.prompts[${index}].slot`);
    const sha256 = requiredText(item.sha256, `contract.prompts[${index}].sha256`);
    const content = requiredText(item.content, `contract.prompts[${index}].content`);
    routeContract(PROMPT_SLOTS.includes(slot), `contract.prompts[${index}].slot is invalid`);
    routeContract(!prompts.has(slot), `contract.prompts[${index}] is duplicated`);
    routeContract(
      Array.from(content).length <= MAX_PROMPT_CODE_POINTS,
      `contract.prompts[${index}] is too long`,
    );
    routeContract(!content.includes('\u0000'), `contract.prompts[${index}] contains NUL`);
    routeContract(
      SHA256_PATTERN.test(sha256) && createHash('sha256').update(content).digest('hex') === sha256,
      `contract.prompts[${index}] digest mismatch`,
    );
    prompts.set(slot, content);
  }
  routeContract(prompts.size === PROMPT_SLOTS.length, 'contract.prompts coverage mismatch');
  return prompts;
}

function assetVersions(value: unknown, label: string): ProductAssetVersion[] {
  routeContract(Array.isArray(value), `${label} must be an array`);
  return value.map((asset, index) => {
    const item = exactKeys(asset, ['id', 'version', 'sha256'], `${label}[${index}]`);
    const id = requiredText(item.id, `${label}[${index}].id`);
    const version = requiredText(item.version, `${label}[${index}].version`);
    const sha256 = requiredText(item.sha256, `${label}[${index}].sha256`);
    routeContract(SHA256_PATTERN.test(sha256), `${label}[${index}].sha256 is invalid`);
    return { id, version, sha256 };
  });
}

function experiment(value: unknown): ProductExperiment | undefined {
  if (value === undefined) return undefined;
  const item = exactKeys(value, ['id', 'variant'], 'snapshot.experiment');
  return {
    id: requiredText(item.id, 'snapshot.experiment.id'),
    variant: requiredText(item.variant, 'snapshot.experiment.variant'),
  };
}

function validateSnapshot(value: unknown) {
  const snapshot = exactKeys(
    value,
    [
      'snapshotId',
      'catalogVersion',
      'productId',
      'skills',
      'plugins',
      'pi',
      'experiment',
      'createdAt',
    ],
    'snapshot',
    ['experiment'],
  );
  const expectedSnapshotId = requiredText(snapshot.snapshotId, 'snapshot.snapshotId');
  const activeExperiment = experiment(snapshot.experiment);
  const rebuilt = createProductSnapshot({
    catalogVersion: requiredText(snapshot.catalogVersion, 'snapshot.catalogVersion'),
    productId: requiredText(snapshot.productId, 'snapshot.productId'),
    skills: assetVersions(snapshot.skills, 'snapshot.skills'),
    plugins: assetVersions(snapshot.plugins, 'snapshot.plugins'),
    pi: assetVersions(snapshot.pi, 'snapshot.pi'),
    ...(activeExperiment ? { experiment: activeExperiment } : {}),
    createdAt: requiredText(snapshot.createdAt, 'snapshot.createdAt'),
  });
  routeContract(rebuilt.snapshotId === expectedSnapshotId, 'snapshot digest mismatch');
  return rebuilt;
}

function validatePluginContracts(value: unknown, snapshot: ReturnType<typeof validateSnapshot>) {
  routeContract(Array.isArray(value), 'contract.plugins must be an array');
  routeContract(value.length === snapshot.plugins.length, 'contract.plugins count mismatch');
  const expected = new Map(
    snapshot.plugins.map((plugin) => [`${plugin.id}@${plugin.version}`, plugin.sha256]),
  );
  const received = new Set<string>();
  for (const [index, plugin] of value.entries()) {
    const item = exactKeys(plugin, ['sha256', 'manifest'], `contract.plugins[${index}]`);
    const sha256 = requiredText(item.sha256, `contract.plugins[${index}].sha256`);
    routeContract(SHA256_PATTERN.test(sha256), `contract.plugins[${index}].sha256 is invalid`);
    const manifest = assertProductPluginSupportedByHost(item.manifest);
    const key = `${manifest.id}@${manifest.version}`;
    routeContract(!received.has(key), `contract.plugins[${index}] is duplicated`);
    routeContract(expected.get(key) === sha256, `contract.plugins[${index}] snapshot mismatch`);
    received.add(key);
  }
  routeContract(received.size === expected.size, 'contract.plugins coverage mismatch');
}

function runIdForTurn(turnId: string): string {
  return `advisor-${createHash('sha256').update(turnId).digest('hex').slice(0, 32)}`;
}

function routeFact(value: unknown): {
  route: string;
  endpoint: string;
  mode: AdvisorMode;
  promptSlot: string;
} {
  const fact = exactKeys(value, ['route', 'endpoint', 'mode', 'promptSlot'], 'runner route fact');
  return {
    route: requiredText(fact.route, 'runner route fact.route'),
    endpoint: requiredText(fact.endpoint, 'runner route fact.endpoint'),
    mode: advisorMode(fact.mode, 'runner route fact.mode'),
    promptSlot: requiredText(fact.promptSlot, 'runner route fact.promptSlot'),
  };
}

export async function prepareAdvisorRoute(
  {
    requestBody,
    user,
    messages,
  }: {
    requestBody?: AdvisorRouteRequestBody;
    user?: AdvisorRouteUser;
    messages?: readonly unknown[];
  },
  options: PrepareAdvisorRouteOptions = {},
): Promise<AdvisorRouteProof | undefined> {
  const enabled = options.enabled ?? process.env.FUTURELINE_PRODUCT_RUNNER_ENABLED === 'on';
  if (!enabled || requestBody?.spec !== 'future-lines') return undefined;

  const principalId = requiredText(user?.id, 'user.id');
  const conversationId = requiredText(requestBody.conversationId, 'conversationId');
  const turnId = requiredText(requestBody.messageId, 'messageId');
  requiredText(requestBody.parentMessageId, 'parentMessageId');
  const engineUrl = requiredText(
    options.engineUrl ?? process.env.FUTURE_ENGINE_URL,
    'FUTURE_ENGINE_URL',
  ).replace(/\/$/, '');
  const internalToken = requiredText(
    options.internalToken ?? process.env.FUTURE_ENGINE_INTERNAL_TOKEN,
    'FUTURE_ENGINE_INTERNAL_TOKEN',
  );
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchRuntimeContract);
  routeContract(typeof fetchImpl === 'function', 'fetch is unavailable');

  const response = await fetchImpl(`${engineUrl}/internal/product-runtime/advisor`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${internalToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ principalId, conversationId }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 2_000),
  });
  routeContract(response.ok, `contract fetch failed with ${response.status}`);
  const contract = exactKeys(
    await response.json(),
    ['schemaVersion', 'flow', 'snapshot', 'prompts', 'plugins'],
    'contract',
  );
  routeContract(contract.schemaVersion === 2, 'contract.schemaVersion must be 2');
  const flow = validateAdvisorFlow(contract.flow);
  const snapshot = validateSnapshot(contract.snapshot);
  const prompts = validatePromptContracts(contract.prompts);
  validatePluginContracts(contract.plugins, snapshot);
  const requestedMode = resolveAdvisorMode(messages);
  const runner = new FuturelineProductRunner({
    flow,
    snapshot,
    actions: [
      {
        id: SELECT_ACTION_ID,
        version: 'v1',
        scopes: [],
        execute: ({ input, state }) => ({
          facts: {
            requested_mode:
              typeof state.facts.requested_mode === 'string'
                ? state.facts.requested_mode
                : (input.defaultMode ?? 'free_chat'),
          },
        }),
      },
      {
        id: ACTION_ID,
        version: 'v1',
        scopes: ['conversation.read'],
        execute: ({ input }) => ({
          facts: { advisorRoute: input },
        }),
      },
    ],
  });
  const output = await runner.invoke({
    runId: runIdForTurn(turnId),
    conversationId,
    principalId,
    facts: { requested_mode: requestedMode },
  });
  routeContract(output.effects.length === 2, 'runner must emit selector and route effects');
  const effect = output.effects[1];
  routeContract(effect.actionId === ACTION_ID, 'runner effect action mismatch');
  const routed = routeFact(output.facts.advisorRoute);
  routeContract(
    routed.route === ROUTE_ID && routed.endpoint === ENDPOINT_ID,
    'runner route mismatch',
  );
  routeContract(routed.mode === requestedMode, 'runner mode mismatch');
  routeContract(
    routed.promptSlot === MODE_DEFINITIONS[routed.mode].promptSlot,
    'runner prompt slot mismatch',
  );
  const corePrompt = prompts.get(CORE_PROMPT_SLOT);
  const modeCard = prompts.get(routed.promptSlot);
  routeContract(corePrompt && modeCard, 'runner prompt assets missing');

  return {
    endpoint: ENDPOINT_ID,
    mode: routed.mode,
    prompts: { core: corePrompt, modeCard },
    headers: {
      'X-Futureline-Product-Snapshot': snapshot.snapshotId,
      'X-Futureline-Product-Flow': `${FLOW_ID}@${FLOW_VERSION}`,
      'X-Futureline-Product-Run': output.runId,
      'X-Futureline-Product-Effect': effect.idempotencyKey,
      'X-Futureline-Product-Mode': routed.mode,
    },
  };
}

export function attachAdvisorRouteProof(
  endpoint: string | null | undefined,
  llmConfig: RunLLMConfig,
  proof?: AdvisorRouteProof,
): boolean {
  if (!proof || endpoint !== proof.endpoint) return false;
  const configuration = llmConfig.configuration ?? {};
  const defaultHeaders = configuration.defaultHeaders as Record<string, string> | null | undefined;
  configuration.defaultHeaders = mergeHeaders(defaultHeaders ?? undefined, proof.headers);
  llmConfig.configuration = configuration;
  return true;
}
