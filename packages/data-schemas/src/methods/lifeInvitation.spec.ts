import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ILifeInvitation } from '~/types';
import { createModels } from '~/models';
import { createLifeInvitationMethods } from './lifeInvitation';

let LifeInvitation: mongoose.Model<ILifeInvitation>;
let methods: ReturnType<typeof createLifeInvitationMethods>;
let mongoServer: MongoMemoryServer;

const inviterUserId = new mongoose.Types.ObjectId();
const acceptedByUserId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  LifeInvitation = mongoose.models.LifeInvitation;
  await LifeInvitation.syncIndexes();
  methods = createLifeInvitationMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await LifeInvitation.deleteMany({});
});

const createInvitation = (codeHash = 'hash-1', expiresAt = new Date(Date.now() + 60_000)) =>
  methods.createLifeInvitation({
    codeHash,
    codeHint: '2M8Q',
    inviterUserId,
    expiresAt,
  });

test('creates a durable pending invitation', async () => {
  const invitation = await createInvitation();

  expect(invitation.status).toBe('pending');
  expect(invitation.codeHint).toBe('2M8Q');
  expect(String(invitation.inviterUserId)).toBe(String(inviterUserId));
});

test('allows only one concurrent reservation', async () => {
  await createInvitation();
  const reservationExpiresAt = new Date(Date.now() + 60_000);

  const results = await Promise.all([
    methods.reserveLifeInvitation({
      codeHash: 'hash-1',
      reservationId: 'reservation-a',
      reservationExpiresAt,
    }),
    methods.reserveLifeInvitation({
      codeHash: 'hash-1',
      reservationId: 'reservation-b',
      reservationExpiresAt,
    }),
  ]);

  expect(results.filter(Boolean)).toHaveLength(1);
  expect(results.filter(Boolean)[0]?.status).toBe('reserved');
});

test('rejects an expired invitation and reclaims an expired reservation', async () => {
  await createInvitation('expired', new Date(Date.now() - 1_000));
  expect(
    await methods.reserveLifeInvitation({
      codeHash: 'expired',
      reservationId: 'too-late',
      reservationExpiresAt: new Date(Date.now() + 60_000),
    }),
  ).toBeNull();

  const invitation = await createInvitation('reclaimable');
  await LifeInvitation.updateOne(
    { _id: invitation._id },
    {
      status: 'reserved',
      reservationId: 'stale',
      reservationExpiresAt: new Date(Date.now() - 1_000),
    },
  );
  const reclaimed = await methods.reserveLifeInvitation({
    codeHash: 'reclaimable',
    reservationId: 'fresh',
    reservationExpiresAt: new Date(Date.now() + 60_000),
  });

  expect(reclaimed?.reservationId).toBe('fresh');
});

test('releases only the matching reservation', async () => {
  const invitation = await createInvitation();
  await methods.reserveLifeInvitation({
    codeHash: 'hash-1',
    reservationId: 'reservation-a',
    reservationExpiresAt: new Date(Date.now() + 60_000),
  });

  expect(
    await methods.releaseLifeInvitation({
      invitationId: invitation._id,
      reservationId: 'reservation-b',
    }),
  ).toBeNull();
  const released = await methods.releaseLifeInvitation({
    invitationId: invitation._id,
    reservationId: 'reservation-a',
  });

  expect(released?.status).toBe('pending');
  expect(released?.reservationId).toBeUndefined();
});

test('accepts once and records the invited user', async () => {
  const invitation = await methods.createLifeInvitation({
    codeHash: 'hash-1',
    codeHint: '2M8Q',
    codePlain: 'ABCD2M8Q',
    inviterUserId,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await methods.reserveLifeInvitation({
    codeHash: 'hash-1',
    reservationId: 'reservation-a',
    reservationExpiresAt: new Date(Date.now() + 60_000),
  });

  const accepted = await methods.finalizeLifeInvitation({
    invitationId: invitation._id,
    reservationId: 'reservation-a',
    acceptedByUserId,
  });
  const duplicate = await methods.finalizeLifeInvitation({
    invitationId: invitation._id,
    reservationId: 'reservation-a',
    acceptedByUserId: new mongoose.Types.ObjectId(),
  });

  expect(accepted?.status).toBe('accepted');
  expect(String(accepted?.acceptedByUserId)).toBe(String(acceptedByUserId));
  expect(accepted?.acceptedAt).toBeInstanceOf(Date);
  expect(accepted?.codePlain).toBeUndefined();
  expect(duplicate).toBeNull();
});

test('redacts plaintext codes after invitations expire', async () => {
  const expired = await methods.createLifeInvitation({
    codeHash: 'expired-plain',
    codeHint: 'OLD1',
    codePlain: 'EXPIREDOLD1',
    inviterUserId,
    expiresAt: new Date(Date.now() - 1_000),
  });
  await methods.createLifeInvitation({
    codeHash: 'pending-plain',
    codeHint: 'NEW1',
    codePlain: 'PENDINGNEW1',
    inviterUserId,
    expiresAt: new Date(Date.now() + 60_000),
  });

  expect(await methods.redactExpiredLifeInvitationPlaintexts()).toBe(1);
  expect((await LifeInvitation.findById(expired._id).lean())?.codePlain).toBeUndefined();
  expect((await LifeInvitation.findOne({ codeHash: 'pending-plain' }).lean())?.codePlain).toBe(
    'PENDINGNEW1',
  );
});
