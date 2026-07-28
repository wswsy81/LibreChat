import { createHash } from 'node:crypto';
import { Annotation, Command, END, START, StateGraph, interrupt } from '@langchain/langgraph';

export type ProductRuntimePrimitive = string | number | boolean | null;
export type ProductRuntimeValue =
  | ProductRuntimePrimitive
  | ProductRuntimeValue[]
  | { [key: string]: ProductRuntimeValue };

type ProductRuntimeObject = { [key: string]: ProductRuntimeValue };

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const ACTION_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}(?:\.[a-z][a-z0-9-]{1,63})+$/;
const VERSION_PATTERN = /^v[1-9][0-9]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FACT_PATH_PATTERN = /^[a-z][a-z0-9_]{0,63}(?:\.[a-z][a-z0-9_]{0,63})*$/;
const DATA_SCOPES = new Set(['profile.read', 'profile.write', 'conversation.read', 'report.write']);
const CONDITION_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists']);

export type ProductDataScope = 'profile.read' | 'profile.write' | 'conversation.read' | 'report.write';
export type FlowConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists';

export interface ProductAssetVersion {
  id: string;
  version: string;
  sha256: string;
}

export interface ProductExperiment {
  id: string;
  variant: string;
}

export interface ProductSnapshot {
  snapshotId: string;
  catalogVersion: string;
  productId: string;
  skills: ProductAssetVersion[];
  plugins: ProductAssetVersion[];
  pi: ProductAssetVersion[];
  experiment?: ProductExperiment;
  createdAt: string;
}

export interface ProductSnapshotInput extends Omit<ProductSnapshot, 'snapshotId'> {}

export interface ProductPluginManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  actions: string[];
  scopes: ProductDataScope[];
  clientPrimitiveId?: string;
  minHostVersion?: string;
}

export interface ProductFlowCondition {
  fact: string;
  op: FlowConditionOperator;
  value?: ProductRuntimePrimitive;
}

export interface ProductFlowPause {
  kind: 'choice' | 'input' | 'approval';
  payload: ProductRuntimeValue;
  fact: string;
}

export interface ProductFlowNode {
  id: string;
  actionId: string;
  input?: ProductRuntimeObject;
  pause?: ProductFlowPause;
}

export interface ProductFlowEdge {
  from: string;
  to: string;
  when?: ProductFlowCondition;
}

export interface ProductFlow {
  schemaVersion: 1;
  id: string;
  version: string;
  entry: string;
  permissions: ProductDataScope[];
  nodes: ProductFlowNode[];
  edges: ProductFlowEdge[];
}

export interface ProductRunEffect {
  actionId: string;
  idempotencyKey: string;
}

export interface ProductRunState {
  runId: string;
  conversationId: string;
  principalId: string;
  productSnapshot: ProductSnapshot;
  activeNodeId: string;
  facts: ProductRuntimeObject;
  materialRefs: string[];
  rendered: Array<{ component: string; payloadRef: string }>;
  pendingInterrupt?: { kind: 'choice' | 'input' | 'approval'; nodeId: string };
  effects: ProductRunEffect[];
}

export interface ProductActionResult {
  facts?: ProductRuntimeObject;
  materialRefs?: string[];
  rendered?: Array<{ component: string; payloadRef: string }>;
}

export interface ProductActionContext {
  input: ProductRuntimeObject;
  state: ProductRunState;
  snapshot: ProductSnapshot;
  nodeId: string;
  idempotencyKey: string;
}

export interface ProductActionDefinition {
  id: string;
  version: string;
  scopes: ProductDataScope[];
  execute(context: ProductActionContext): ProductActionResult | Promise<ProductActionResult>;
}

export class ProductRuntimeContractError extends Error {
  code = 'PRODUCT_RUNTIME_CONTRACT_INVALID';
}

export class ProductSnapshotMismatchError extends Error {
  code = 'PRODUCT_SNAPSHOT_MISMATCH';
}

function contract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ProductRuntimeContractError(message);
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
  contract(isObject(value), `${label} must be an object`);
  const actual = Object.keys(value);
  const unknown = actual.filter((key) => !keys.includes(key));
  const missing = keys.filter(
    (key) => !optional.includes(key) && !Object.prototype.hasOwnProperty.call(value, key),
  );
  contract(unknown.length === 0 && missing.length === 0, `${label} fields mismatch`);
  return value;
}

function assertId(value: unknown, label: string, pattern = ID_PATTERN): asserts value is string {
  contract(typeof value === 'string' && pattern.test(value), `${label} is invalid`);
}

function assertVersion(value: unknown, label: string): asserts value is string {
  contract(typeof value === 'string' && VERSION_PATTERN.test(value), `${label} must be vN`);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  contract(typeof value === 'string' && SHA256_PATTERN.test(value), `${label} must be sha256`);
}

function isRuntimeValue(value: unknown): value is ProductRuntimeValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isRuntimeValue);
  return isObject(value) && Object.values(value).every(isRuntimeValue);
}

function assertScopes(value: unknown, label: string): asserts value is ProductDataScope[] {
  contract(Array.isArray(value) && value.every((scope) => typeof scope === 'string' && DATA_SCOPES.has(scope)), `${label} has invalid scope`);
  contract(new Set(value).size === value.length, `${label} has duplicate scopes`);
}

function stableJson(value: ProductRuntimeValue): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key] as ProductRuntimeValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: ProductRuntimeValue): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function validateAssetVersions(value: unknown, label: string): ProductAssetVersion[] {
  contract(Array.isArray(value), `${label} must be an array`);
  return value.map((asset, index) => {
    const item = exactKeys(asset, ['id', 'version', 'sha256'], `${label}[${index}]`);
    assertId(item.id, `${label}[${index}].id`);
    assertVersion(item.version, `${label}[${index}].version`);
    assertSha256(item.sha256, `${label}[${index}].sha256`);
    return { id: item.id, version: item.version, sha256: item.sha256 };
  });
}

/** Builds an immutable run identity from already-published product assets. */
export function createProductSnapshot(input: ProductSnapshotInput): ProductSnapshot {
  assertVersion(input.catalogVersion, 'snapshot.catalogVersion');
  assertId(input.productId, 'snapshot.productId');
  const createdAt = new Date(input.createdAt);
  contract(!Number.isNaN(createdAt.getTime()), 'snapshot.createdAt is invalid');
  const skills = validateAssetVersions(input.skills, 'snapshot.skills');
  const plugins = validateAssetVersions(input.plugins, 'snapshot.plugins');
  const pi = validateAssetVersions(input.pi, 'snapshot.pi');
  if (input.experiment) {
    assertId(input.experiment.id, 'snapshot.experiment.id');
    assertId(input.experiment.variant, 'snapshot.experiment.variant');
  }
  const body = {
    catalogVersion: input.catalogVersion,
    productId: input.productId,
    skills,
    plugins,
    pi,
    ...(input.experiment ? { experiment: input.experiment } : {}),
    createdAt: createdAt.toISOString(),
  } satisfies Omit<ProductSnapshot, 'snapshotId'>;
  return Object.freeze({ snapshotId: digest(body as unknown as ProductRuntimeValue), ...body });
}

export function validateProductPluginManifest(value: unknown): ProductPluginManifest {
  const manifest = exactKeys(
    value,
    ['schemaVersion', 'id', 'version', 'actions', 'scopes', 'clientPrimitiveId', 'minHostVersion'],
    'plugin manifest',
    ['clientPrimitiveId', 'minHostVersion'],
  );
  contract(manifest.schemaVersion === 1, 'plugin manifest.schemaVersion must be 1');
  assertId(manifest.id, 'plugin manifest.id');
  assertVersion(manifest.version, 'plugin manifest.version');
  contract(Array.isArray(manifest.actions) && manifest.actions.length > 0, 'plugin manifest.actions is required');
  for (const actionId of manifest.actions) assertId(actionId, 'plugin manifest.action', ACTION_ID_PATTERN);
  contract(new Set(manifest.actions).size === manifest.actions.length, 'plugin manifest.actions has duplicates');
  assertScopes(manifest.scopes, 'plugin manifest.scopes');
  if (manifest.clientPrimitiveId !== undefined) assertId(manifest.clientPrimitiveId, 'plugin manifest.clientPrimitiveId');
  if (manifest.minHostVersion !== undefined) assertVersion(manifest.minHostVersion, 'plugin manifest.minHostVersion');
  return manifest as unknown as ProductPluginManifest;
}

export function validateProductFlow(value: unknown): ProductFlow {
  const flow = exactKeys(value, ['schemaVersion', 'id', 'version', 'entry', 'permissions', 'nodes', 'edges'], 'flow');
  contract(flow.schemaVersion === 1, 'flow.schemaVersion must be 1');
  assertId(flow.id, 'flow.id');
  assertVersion(flow.version, 'flow.version');
  assertId(flow.entry, 'flow.entry');
  assertScopes(flow.permissions, 'flow.permissions');
  contract(Array.isArray(flow.nodes) && flow.nodes.length > 0, 'flow.nodes is required');
  const nodes = flow.nodes.map((node, index) => {
    const item = exactKeys(node, ['id', 'actionId', 'input', 'pause'], `flow.nodes[${index}]`, ['input', 'pause']);
    assertId(item.id, `flow.nodes[${index}].id`);
    assertId(item.actionId, `flow.nodes[${index}].actionId`, ACTION_ID_PATTERN);
    if (item.input !== undefined) contract(isObject(item.input) && isRuntimeValue(item.input), `flow.nodes[${index}].input is invalid`);
    if (item.pause !== undefined) {
      const pause = exactKeys(item.pause, ['kind', 'payload', 'fact'], `flow.nodes[${index}].pause`);
      contract(['choice', 'input', 'approval'].includes(String(pause.kind)), `flow.nodes[${index}].pause.kind is invalid`);
      contract(isRuntimeValue(pause.payload), `flow.nodes[${index}].pause.payload is invalid`);
      contract(typeof pause.fact === 'string' && FACT_PATH_PATTERN.test(pause.fact), `flow.nodes[${index}].pause.fact is invalid`);
    }
    return item as unknown as ProductFlowNode;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  contract(nodeIds.size === nodes.length, 'flow.nodes has duplicate ids');
  contract(nodeIds.has(flow.entry), 'flow.entry is not a node');
  contract(Array.isArray(flow.edges), 'flow.edges must be an array');
  const edges = flow.edges.map((edge, index) => {
    const item = exactKeys(edge, ['from', 'to', 'when'], `flow.edges[${index}]`, ['when']);
    assertId(item.from, `flow.edges[${index}].from`);
    contract(typeof item.to === 'string' && (item.to === 'END' || ID_PATTERN.test(item.to)), `flow.edges[${index}].to is invalid`);
    contract(nodeIds.has(item.from), `flow.edges[${index}].from is unknown`);
    contract(item.to === 'END' || nodeIds.has(item.to), `flow.edges[${index}].to is unknown`);
    if (item.when !== undefined) {
      const when = exactKeys(item.when, ['fact', 'op', 'value'], `flow.edges[${index}].when`, ['value']);
      contract(typeof when.fact === 'string' && FACT_PATH_PATTERN.test(when.fact), `flow.edges[${index}].when.fact is invalid`);
      contract(typeof when.op === 'string' && CONDITION_OPERATORS.has(when.op), `flow.edges[${index}].when.op is invalid`);
      if (when.op === 'exists') contract(when.value === undefined, `flow.edges[${index}].when.value is forbidden for exists`);
      else contract(when.value === null || ['string', 'number', 'boolean'].includes(typeof when.value), `flow.edges[${index}].when.value is invalid`);
    }
    return item as unknown as ProductFlowEdge;
  });
  return { ...flow, nodes, edges } as ProductFlow;
}

export function createProductActionRegistry(
  definitions: ProductActionDefinition[],
): ReadonlyMap<string, ProductActionDefinition> {
  const registry = new Map<string, ProductActionDefinition>();
  for (const definition of definitions) {
    assertId(definition.id, 'action.id', ACTION_ID_PATTERN);
    assertVersion(definition.version, `action ${definition.id}.version`);
    assertScopes(definition.scopes, `action ${definition.id}.scopes`);
    contract(typeof definition.execute === 'function', `action ${definition.id}.execute is required`);
    contract(!registry.has(definition.id), `action ${definition.id} is duplicated`);
    registry.set(definition.id, Object.freeze({ ...definition, scopes: [...definition.scopes] }));
  }
  return registry;
}

function readFact(facts: ProductRuntimeObject, path: string): ProductRuntimeValue | undefined {
  return path.split('.').reduce<ProductRuntimeValue | undefined>((value, key) => {
    if (!isObject(value)) return undefined;
    return value[key] as ProductRuntimeValue | undefined;
  }, facts);
}

function matchesCondition(facts: ProductRuntimeObject, condition: ProductFlowCondition | undefined): boolean {
  if (!condition) return true;
  const actual = readFact(facts, condition.fact);
  if (condition.op === 'exists') return actual !== undefined && actual !== null;
  switch (condition.op) {
    case 'eq': return actual === condition.value;
    case 'neq': return actual !== condition.value;
    case 'gt': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'gte': return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'lt': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case 'lte': return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
    default: return false;
  }
}

function writeFact(facts: ProductRuntimeObject, path: string, value: ProductRuntimeValue): ProductRuntimeObject {
  const next = structuredClone(facts);
  const parts = path.split('.');
  let current = next;
  for (const part of parts.slice(0, -1)) {
    const child = current[part];
    current[part] = isObject(child) ? child : {};
    current = current[part] as ProductRuntimeObject;
  }
  current[parts[parts.length - 1]] = value;
  return next;
}

function actionKey(state: ProductRunState, actionId: string, nodeId: string): string {
  return digest({ runId: state.runId, snapshotId: state.productSnapshot.snapshotId, actionId, nodeId });
}

/**
 * LangGraph reserves checkpoint metadata for its own source/step bookkeeping. Preserve the
 * existing saver and add only the small, immutable product identity required to explain a run.
 */
function withProductCheckpointMetadata(checkpointer: unknown): unknown {
  if (!checkpointer) return undefined;
  contract(typeof checkpointer === 'object', 'checkpointer must be an object');
  return new Proxy(checkpointer, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);
      if (property !== 'put' || typeof member !== 'function') {
        return typeof member === 'function' ? member.bind(target) : member;
      }
      return async (...args: unknown[]) => {
        const checkpoint = args[1] as { channel_values?: Partial<ProductRunState> } | undefined;
        const metadata = (args[2] && typeof args[2] === 'object' ? args[2] : {}) as Record<string, unknown>;
        const state = checkpoint?.channel_values;
        return Reflect.apply(member, target, [
          args[0],
          checkpoint,
          {
            ...metadata,
            ...(state?.runId && state.productSnapshot
              ? { futureline: { runId: state.runId, productSnapshot: state.productSnapshot } }
              : {}),
          },
          args[3],
        ]);
      };
    },
  });
}

const ProductState = Annotation.Root({
  runId: Annotation<string>,
  conversationId: Annotation<string>,
  principalId: Annotation<string>,
  productSnapshot: Annotation<ProductSnapshot>,
  activeNodeId: Annotation<string>,
  facts: Annotation<ProductRuntimeObject>,
  materialRefs: Annotation<string[]>,
  rendered: Annotation<Array<{ component: string; payloadRef: string }>>,
  pendingInterrupt: Annotation<{ kind: 'choice' | 'input' | 'approval'; nodeId: string } | undefined>,
  effects: Annotation<ProductRunEffect[]>,
});

export interface FuturelineProductRunnerOptions {
  flow: unknown;
  snapshot: ProductSnapshot;
  actions: ProductActionDefinition[];
  checkpointer?: unknown;
}

export interface ProductRunInput {
  runId: string;
  conversationId: string;
  principalId: string;
  facts?: ProductRuntimeObject;
}

/**
 * The only product-flow executor. It compiles a checked declarative flow to LangGraph;
 * callers provide the host's existing checkpointer rather than creating another store.
 */
export class FuturelineProductRunner {
  readonly flow: ProductFlow;
  readonly snapshot: ProductSnapshot;
  private readonly actions: ReadonlyMap<string, ProductActionDefinition>;
  private readonly graph: any;

  constructor({ flow, snapshot, actions, checkpointer }: FuturelineProductRunnerOptions) {
    this.flow = validateProductFlow(flow);
    this.snapshot = createProductSnapshot(snapshot);
    this.actions = createProductActionRegistry(actions);
    for (const node of this.flow.nodes) {
      const action = this.actions.get(node.actionId);
      contract(action, `flow node ${node.id} references unregistered action ${node.actionId}`);
      for (const scope of action.scopes) {
        contract(this.flow.permissions.includes(scope), `flow node ${node.id} exceeds permission ${scope}`);
      }
    }

    // Node ids are supplied by a validated product asset at runtime, while LangGraph's
    // generic builder infers only literal ids known at declaration time.
    let graph: any = new StateGraph(ProductState);
    for (const node of this.flow.nodes) {
      const action = this.actions.get(node.actionId)!;
      graph = graph.addNode(node.id, async (state: ProductRunState) => {
        const idempotencyKey = actionKey(state, action.id, node.id);
        const result = await action.execute({
          input: node.input ?? {},
          state,
          snapshot: state.productSnapshot,
          nodeId: node.id,
          idempotencyKey,
        });
        return {
          activeNodeId: node.id,
          facts: { ...state.facts, ...(result.facts ?? {}) },
          materialRefs: [...state.materialRefs, ...(result.materialRefs ?? [])],
          rendered: [...state.rendered, ...(result.rendered ?? [])],
          pendingInterrupt: node.pause ? { kind: node.pause.kind, nodeId: node.id } : undefined,
          effects: [...state.effects, { actionId: action.id, idempotencyKey }],
        };
      });
      if (node.pause) {
        const pauseNodeId = `__futureline_pause_${node.id}`;
        graph = graph.addNode(pauseNodeId, (state: ProductRunState) => {
          const value = interrupt({
            kind: node.pause!.kind,
            nodeId: node.id,
            payload: node.pause!.payload,
          });
          return {
            facts: writeFact(state.facts, node.pause!.fact, value as ProductRuntimeValue),
            pendingInterrupt: undefined,
          };
        });
      }
    }
    graph = graph.addEdge(START, this.flow.entry);
    for (const node of this.flow.nodes) {
      const edges = this.flow.edges.filter((edge) => edge.from === node.id);
      const source = node.pause ? `__futureline_pause_${node.id}` : node.id;
      if (node.pause) graph = graph.addEdge(node.id, source);
      if (edges.length === 0) graph = graph.addEdge(source, END);
      else {
        graph = graph.addConditionalEdges(source, (state: ProductRunState) => {
          const selected = edges.find((edge) => matchesCondition(state.facts, edge.when));
          contract(selected, `flow node ${node.id} has no matching edge`);
          return selected.to === 'END' ? END : selected.to;
        });
      }
    }
    this.graph = graph.compile({ checkpointer: withProductCheckpointMetadata(checkpointer) as never });
  }

  private config(conversationId: string, runId?: string) {
    return {
      configurable: { thread_id: conversationId },
      metadata: {
        productSnapshot: this.snapshot,
        ...(runId ? { productRunId: runId } : {}),
      },
      durability: 'exit' as const,
    };
  }

  async invoke(input: ProductRunInput): Promise<ProductRunState> {
    assertId(input.runId, 'runId');
    contract(typeof input.conversationId === 'string' && input.conversationId.length > 0, 'conversationId is required');
    contract(typeof input.principalId === 'string' && input.principalId.length > 0, 'principalId is required');
    const initial: ProductRunState = {
      runId: input.runId,
      conversationId: input.conversationId,
      principalId: input.principalId,
      productSnapshot: this.snapshot,
      activeNodeId: this.flow.entry,
      facts: input.facts ?? {},
      materialRefs: [],
      rendered: [],
      effects: [],
    };
    return (await this.graph.invoke(initial, this.config(input.conversationId, input.runId))) as ProductRunState;
  }

  async resume(conversationId: string, value: ProductRuntimeValue): Promise<ProductRunState> {
    const config = this.config(conversationId);
    const current = await this.graph.getState(config);
    const state = current.values as Partial<ProductRunState>;
    contract(state.productSnapshot, 'no resumable product run exists');
    if (state.productSnapshot.snapshotId !== this.snapshot.snapshotId) {
      throw new ProductSnapshotMismatchError('resuming a product run requires its original Product Snapshot');
    }
    return (await this.graph.invoke(new Command({ resume: value }), config)) as ProductRunState;
  }

  async getState(conversationId: string): Promise<ProductRunState | undefined> {
    const current = await this.graph.getState(this.config(conversationId));
    return current.values.productSnapshot ? (current.values as ProductRunState) : undefined;
  }
}
