import { MemorySaver } from '@langchain/langgraph-checkpoint';
import {
  createProductSnapshot,
  FuturelineProductRunner,
  ProductRuntimeContractError,
  ProductSnapshotMismatchError,
  validateProductFlow,
  validateProductPluginManifest,
} from './productRuntime';
import type { ProductActionDefinition, ProductFlow, ProductSnapshot } from './productRuntime';

const sha = (character: string) => character.repeat(64);

function snapshot(createdAt = '2026-07-28T00:00:00.000Z'): ProductSnapshot {
  return createProductSnapshot({
    catalogVersion: 'v1',
    productId: 'futureline-current-v1',
    skills: [{ id: 'entry-house', version: 'v1', sha256: sha('a') }],
    plugins: [{ id: 'choice-ui', version: 'v1', sha256: sha('b') }],
    pi: [{ id: 'warm-expression', version: 'v1', sha256: sha('c') }],
    createdAt,
  });
}

const flow: ProductFlow = {
  schemaVersion: 1,
  id: 'first-turn',
  version: 'v1',
  entry: 'collect',
  permissions: ['conversation.read'],
  nodes: [
    { id: 'collect', actionId: 'collect.material', input: { source: 'opening' } },
    {
      id: 'choose',
      actionId: 'ui.choice',
      pause: {
        kind: 'choice',
        payload: { options: ['work', 'love'] },
        fact: 'selection',
      },
    },
    { id: 'present', actionId: 'ui.text', input: { component: 'future-line' } },
  ],
  edges: [
    { from: 'collect', to: 'choose' },
    { from: 'choose', to: 'present', when: { fact: 'selection', op: 'exists' } },
    { from: 'present', to: 'END' },
  ],
};

function actions(seenSnapshots: string[] = []): ProductActionDefinition[] {
  return [
    {
      id: 'collect.material',
      version: 'v1',
      scopes: ['conversation.read'],
      execute: ({ input, snapshot }) => {
        seenSnapshots.push(snapshot.snapshotId);
        return { facts: { source: input.source ?? null }, materialRefs: ['material:opening'] };
      },
    },
    {
      id: 'ui.choice',
      version: 'v1',
      scopes: [],
      execute: ({ snapshot }) => {
        seenSnapshots.push(snapshot.snapshotId);
        return { rendered: [{ component: 'choice', payloadRef: 'choice:opening' }] };
      },
    },
    {
      id: 'ui.text',
      version: 'v1',
      scopes: [],
      execute: ({ snapshot }) => {
        seenSnapshots.push(snapshot.snapshotId);
        return { rendered: [{ component: 'text', payloadRef: 'text:future-line' }] };
      },
    },
  ];
}

describe('FuturelineProductRunner', () => {
  it('compiles a restricted flow to LangGraph and resumes using the frozen snapshot', async () => {
    const checkpointer = new MemorySaver();
    const activeSnapshot = snapshot();
    const seenSnapshots: string[] = [];
    const runner = new FuturelineProductRunner({
      flow,
      snapshot: activeSnapshot,
      actions: actions(seenSnapshots),
      checkpointer,
    });

    await runner.invoke({
      runId: 'run-001',
      conversationId: 'conversation-001',
      principalId: 'principal-001',
    });
    const paused = await runner.getState('conversation-001');
    expect(paused?.pendingInterrupt).toEqual({ kind: 'choice', nodeId: 'choose' });
    const checkpoint = await checkpointer.getTuple({ configurable: { thread_id: 'conversation-001' } });
    expect(checkpoint?.metadata).toMatchObject({
      futureline: {
        runId: 'run-001',
        productSnapshot: { snapshotId: activeSnapshot.snapshotId },
      },
    });
    const output = await runner.resume('conversation-001', 'work');

    expect(output.productSnapshot.snapshotId).toBe(activeSnapshot.snapshotId);
    expect(output.facts).toMatchObject({ source: 'opening', selection: 'work' });
    expect(output.materialRefs).toEqual(['material:opening']);
    expect(output.rendered).toEqual([
      { component: 'choice', payloadRef: 'choice:opening' },
      { component: 'text', payloadRef: 'text:future-line' },
    ]);
    expect(new Set(seenSnapshots)).toEqual(new Set([activeSnapshot.snapshotId]));
    expect(seenSnapshots).toHaveLength(3);
    expect(output.effects.map((effect) => effect.idempotencyKey)).toHaveLength(3);
    expect(new Set(output.effects.map((effect) => effect.idempotencyKey)).size).toBe(3);
  });

  it('rejects a resume when a newer catalog snapshot tries to reinterpret a paused run', async () => {
    const checkpointer = new MemorySaver();
    const first = new FuturelineProductRunner({ flow, snapshot: snapshot(), actions: actions(), checkpointer });
    await first.invoke({ runId: 'run-002', conversationId: 'conversation-002', principalId: 'principal-002' });
    const newerCatalog = new FuturelineProductRunner({
      flow,
      snapshot: snapshot('2026-07-29T00:00:00.000Z'),
      actions: actions(),
      checkpointer,
    });

    await expect(newerCatalog.resume('conversation-002', 'love')).rejects.toBeInstanceOf(ProductSnapshotMismatchError);
  });

  it('rejects unregistered actions and data scopes before a StateGraph exists', () => {
    expect(() => new FuturelineProductRunner({
      flow: { ...flow, entry: 'bad-node', nodes: [{ id: 'bad-node', actionId: 'model.generate' }], edges: [] },
      snapshot: snapshot(),
      actions: [],
    })).toThrow(ProductRuntimeContractError);

    expect(() => new FuturelineProductRunner({
      flow: { ...flow, entry: 'read', permissions: [], nodes: [{ id: 'read', actionId: 'collect.material' }], edges: [] },
      snapshot: snapshot(),
      actions: actions(),
    })).toThrow(/exceeds permission/);
  });
});

describe('Product runtime contracts', () => {
  it('rejects executable fields and unrestricted plugin declarations', () => {
    expect(() => validateProductFlow({
      ...flow,
      nodes: [{ id: 'collect', actionId: 'collect.material', script: 'require(\"child_process\")' }],
      edges: [],
    })).toThrow(ProductRuntimeContractError);

    expect(() => validateProductPluginManifest({
      schemaVersion: 1,
      id: 'dangerous-plugin',
      version: 'v1',
      actions: ['tool.invoke'],
      scopes: ['filesystem.write'],
    })).toThrow(ProductRuntimeContractError);
  });

  it('makes an equal snapshot deterministic and retains only declared product inputs', () => {
    const a = snapshot();
    const b = snapshot();
    expect(a).toEqual(b);
    expect(a.snapshotId).toMatch(/^[a-f0-9]{64}$/);
  });
});
