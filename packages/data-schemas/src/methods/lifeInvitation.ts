import type {
  CreateLifeInvitationInput,
  FinalizeLifeInvitationInput,
  ILifeInvitation,
  ReleaseLifeInvitationInput,
  ReserveLifeInvitationInput,
} from '~/types';

export function createLifeInvitationMethods(mongoose: typeof import('mongoose')): {
  createLifeInvitation: (input: CreateLifeInvitationInput) => Promise<ILifeInvitation>;
  reserveLifeInvitation: (input: ReserveLifeInvitationInput) => Promise<ILifeInvitation | null>;
  finalizeLifeInvitation: (input: FinalizeLifeInvitationInput) => Promise<ILifeInvitation | null>;
  releaseLifeInvitation: (input: ReleaseLifeInvitationInput) => Promise<ILifeInvitation | null>;
  redactExpiredLifeInvitationPlaintexts: () => Promise<number>;
} {
  const getModel = () => mongoose.models.LifeInvitation;

  const createLifeInvitation = async (input: CreateLifeInvitationInput): Promise<ILifeInvitation> =>
    await getModel().create(input);

  const reserveLifeInvitation = async (
    input: ReserveLifeInvitationInput,
  ): Promise<ILifeInvitation | null> => {
    const now = new Date();
    return await getModel().findOneAndUpdate(
      {
        codeHash: input.codeHash,
        expiresAt: { $gt: now },
        $or: [{ status: 'pending' }, { status: 'reserved', reservationExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          status: 'reserved',
          reservationId: input.reservationId,
          reservedAt: now,
          reservationExpiresAt: input.reservationExpiresAt,
        },
      },
      { new: true },
    );
  };

  const finalizeLifeInvitation = async (
    input: FinalizeLifeInvitationInput,
  ): Promise<ILifeInvitation | null> =>
    await getModel().findOneAndUpdate(
      {
        _id: input.invitationId,
        status: 'reserved',
        reservationId: input.reservationId,
      },
      {
        $set: {
          status: 'accepted',
          acceptedByUserId: input.acceptedByUserId,
          acceptedAt: new Date(),
        },
        $unset: { codePlain: '', reservationId: '', reservedAt: '', reservationExpiresAt: '' },
      },
      { new: true },
    );

  const redactExpiredLifeInvitationPlaintexts = async (): Promise<number> => {
    const result = await getModel().updateMany(
      { expiresAt: { $lte: new Date() }, codePlain: { $exists: true } },
      { $unset: { codePlain: '' } },
    );
    return result.modifiedCount ?? 0;
  };

  const releaseLifeInvitation = async (
    input: ReleaseLifeInvitationInput,
  ): Promise<ILifeInvitation | null> =>
    await getModel().findOneAndUpdate(
      {
        _id: input.invitationId,
        status: 'reserved',
        reservationId: input.reservationId,
      },
      {
        $set: { status: 'pending' },
        $unset: { reservationId: '', reservedAt: '', reservationExpiresAt: '' },
      },
      { new: true },
    );

  return {
    createLifeInvitation,
    reserveLifeInvitation,
    finalizeLifeInvitation,
    releaseLifeInvitation,
    redactExpiredLifeInvitationPlaintexts,
  };
}

export type LifeInvitationMethods = ReturnType<typeof createLifeInvitationMethods>;
