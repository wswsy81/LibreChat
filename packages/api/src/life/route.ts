import { createHash } from 'node:crypto';
import type { RunLLMConfig } from '~/types';
import { mergeHeaders } from '~/utils/headers';
import {
  createProductSnapshot,
  FuturelineProductRunner,
  type ProductAssetVersion,
  type ProductExperiment,
} from './productRuntime';

const FLOW_ID = 'futureline-advisor-route';
const FLOW_VERSION = 'v1';
const ACTION_ID = 'advisor.route';
const NODE_ID = 'route';
const ROUTE_ID = 'advisor-gateway-v1';
const ENDPOINT_ID = 'polaris';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

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
  headers: {
    'X-Futureline-Product-Snapshot': string;
    'X-Futureline-Product-Flow': string;
    'X-Futureline-Product-Run': string;
    'X-Futureline-Product-Effect': string;
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
  routeContract(Array.isArray(flow.nodes) && flow.nodes.length === 1, 'flow must have one node');
  const node = exactKeys(flow.nodes[0], ['id', 'actionId', 'input'], 'flow.nodes[0]');
  const input = exactKeys(node.input, ['route', 'endpoint'], 'flow.nodes[0].input');
  routeContract(node.id === NODE_ID && node.actionId === ACTION_ID, 'flow action mismatch');
  routeContract(input.route === ROUTE_ID && input.endpoint === ENDPOINT_ID, 'flow target mismatch');
  routeContract(Array.isArray(flow.edges) && flow.edges.length === 1, 'flow must have one edge');
  const edge = exactKeys(flow.edges[0], ['from', 'to'], 'flow.edges[0]');
  routeContract(edge.from === NODE_ID && edge.to === 'END', 'flow edge mismatch');
  return value;
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

function runIdForTurn(turnId: string): string {
  return `advisor-${createHash('sha256').update(turnId).digest('hex').slice(0, 32)}`;
}

function routeFact(value: unknown): { route: string; endpoint: string } {
  const fact = exactKeys(value, ['route', 'endpoint'], 'runner route fact');
  return {
    route: requiredText(fact.route, 'runner route fact.route'),
    endpoint: requiredText(fact.endpoint, 'runner route fact.endpoint'),
  };
}

export async function prepareAdvisorRoute(
  {
    requestBody,
    user,
  }: {
    requestBody?: AdvisorRouteRequestBody;
    user?: AdvisorRouteUser;
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
    method: 'GET',
    headers: { Authorization: `Bearer ${internalToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs ?? 2_000),
  });
  routeContract(response.ok, `contract fetch failed with ${response.status}`);
  const contract = exactKeys(
    await response.json(),
    ['schemaVersion', 'flow', 'snapshot'],
    'contract',
  );
  routeContract(contract.schemaVersion === 1, 'contract.schemaVersion must be 1');
  const flow = validateAdvisorFlow(contract.flow);
  const snapshot = validateSnapshot(contract.snapshot);
  const runner = new FuturelineProductRunner({
    flow,
    snapshot,
    actions: [
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
  });
  routeContract(output.effects.length === 1, 'runner must emit one effect');
  const effect = output.effects[0];
  routeContract(effect.actionId === ACTION_ID, 'runner effect action mismatch');
  const routed = routeFact(output.facts.advisorRoute);
  routeContract(
    routed.route === ROUTE_ID && routed.endpoint === ENDPOINT_ID,
    'runner route mismatch',
  );

  return {
    endpoint: ENDPOINT_ID,
    headers: {
      'X-Futureline-Product-Snapshot': snapshot.snapshotId,
      'X-Futureline-Product-Flow': `${FLOW_ID}@${FLOW_VERSION}`,
      'X-Futureline-Product-Run': output.runId,
      'X-Futureline-Product-Effect': effect.idempotencyKey,
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
