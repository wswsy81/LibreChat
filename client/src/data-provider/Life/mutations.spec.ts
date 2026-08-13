import type { LifeSelfChapterItem, LifeSelfProjectionResponse } from 'librechat-data-provider';
import { dataService } from 'librechat-data-provider';
import { annotateLifeDossierWithReconciliation } from './mutations';

jest.mock('librechat-data-provider', () => ({
  dataService: {
    annotateLifeDossier: jest.fn(),
    getLifeSelfProjection: jest.fn(),
  },
  QueryKeys: {
    lifeDossierHtml: 'lifeDossierHtml',
    lifeMapHtml: 'lifeMapHtml',
    lifeArchive: 'lifeArchive',
    lifeSelfProjection: 'lifeSelfProjection',
    lifeBootstrap: 'lifeBootstrap',
  },
}));

const mockedDataService = dataService as jest.Mocked<
  Pick<typeof dataService, 'annotateLifeDossier' | 'getLifeSelfProjection'>
>;

const projectionWith = (item: LifeSelfChapterItem | null): LifeSelfProjectionResponse => ({
  schemaVersion: 2,
  availability: { birthDraft: 'not_provided' },
  projection: {
    schemaVersion: 2,
    revision: 'projection_1234567890abcdef1234',
    updatedAt: null,
    selfFormula: null,
    birthDraft: {
      status: 'unavailable',
      missingFields: ['date'],
      formula: null,
      sun: { certainty: 'unavailable', name: null, sign: null, meaning: 'sun' },
      moon: { certainty: 'unavailable', name: null, sign: null, meaning: 'moon' },
      rising: { certainty: 'unavailable', name: null, sign: null, meaning: 'rising' },
    },
    currentState: null,
    coreTensions: [],
    confirmed: [],
    pending: [],
    chapters: {
      actor: [],
      agent: [],
      author: item ? [item] : [],
      dynamics: [],
      becoming: [],
    },
    stateChain: [],
    lifeWheel: null,
    subtreeRevisions: {
      self: 'self_1234567890abcdef1234',
      birth: 'birth_1234567890abcdef1234',
      currentState: 'state_1234567890abcdef1234',
      pending: 'pending_1234567890abcdef1234',
      stateChain: 'chain_1234567890abcdef1234',
    },
  },
});

const dossierItem = (status: LifeSelfChapterItem['status']): LifeSelfChapterItem => ({
  id: 'dossier:scenes:pending-1',
  kind: status === 'pending' ? 'hypothesis' : 'claim',
  text: '已被用户认领的判断',
  status,
  sourceType: 'dossier',
  sourceIds: ['event:1'],
  dossierRef: { section: 'scenes', entryId: 'pending-1' },
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('回包丢失但权威投影已 confirmed 时恢复为成功', async () => {
  mockedDataService.annotateLifeDossier.mockRejectedValue(new Error('network response lost'));
  mockedDataService.getLifeSelfProjection.mockResolvedValue(
    projectionWith(dossierItem('confirmed')),
  );

  await expect(
    annotateLifeDossierWithReconciliation({
      section: 'scenes',
      entryId: 'pending-1',
      action: 'keep',
    }),
  ).resolves.toMatchObject({ ok: true, entry: { id: 'pending-1', status: 'confirmed' } });
});

test('请求一直不返回时会在有界时间后对账', async () => {
  mockedDataService.annotateLifeDossier.mockReturnValue(new Promise(() => undefined));
  mockedDataService.getLifeSelfProjection.mockResolvedValue(
    projectionWith(dossierItem('confirmed')),
  );

  await expect(
    annotateLifeDossierWithReconciliation(
      { section: 'scenes', entryId: 'pending-1', action: 'keep' },
      1,
      50,
    ),
  ).resolves.toMatchObject({ entry: { status: 'confirmed' } });
  expect(mockedDataService.getLifeSelfProjection).toHaveBeenCalledTimes(1);
});

test('对账后仍是 pending 时保留原错误', async () => {
  const error = new Error('network response lost');
  mockedDataService.annotateLifeDossier.mockRejectedValue(error);
  mockedDataService.getLifeSelfProjection.mockResolvedValue(projectionWith(dossierItem('pending')));

  await expect(
    annotateLifeDossierWithReconciliation({
      section: 'scenes',
      entryId: 'pending-1',
      action: 'keep',
    }),
  ).rejects.toBe(error);
});

test('划掉后条目从投影消失可对账为成功', async () => {
  mockedDataService.annotateLifeDossier.mockRejectedValue(new Error('network response lost'));
  mockedDataService.getLifeSelfProjection.mockResolvedValue(projectionWith(null));

  await expect(
    annotateLifeDossierWithReconciliation({
      section: 'scenes',
      entryId: 'pending-1',
      action: 'strike',
    }),
  ).resolves.toMatchObject({ entry: { status: 'dismissed' } });
});
