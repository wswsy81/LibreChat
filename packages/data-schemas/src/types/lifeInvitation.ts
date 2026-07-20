import type { Document, Types } from 'mongoose';

export type LifeInvitationStatus = 'pending' | 'reserved' | 'accepted' | 'revoked';

export interface ILifeInvitation extends Document {
  _id: Types.ObjectId;
  codeHash: string;
  codeHint: string;
  inviterUserId: Types.ObjectId;
  status: LifeInvitationStatus;
  expiresAt: Date;
  reservationId?: string;
  reservedAt?: Date;
  reservationExpiresAt?: Date;
  acceptedByUserId?: Types.ObjectId;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  tenantId?: string;
}

export interface CreateLifeInvitationInput {
  codeHash: string;
  codeHint: string;
  inviterUserId: Types.ObjectId | string;
  expiresAt: Date;
}

export interface ReserveLifeInvitationInput {
  codeHash: string;
  reservationId: string;
  reservationExpiresAt: Date;
}

export interface FinalizeLifeInvitationInput {
  invitationId: Types.ObjectId | string;
  reservationId: string;
  acceptedByUserId: Types.ObjectId | string;
}

export interface ReleaseLifeInvitationInput {
  invitationId: Types.ObjectId | string;
  reservationId: string;
}
