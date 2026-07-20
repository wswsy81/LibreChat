import { Schema } from 'mongoose';
import type { ILifeInvitation } from '~/types';

const lifeInvitationSchema: Schema<ILifeInvitation> = new Schema<ILifeInvitation>(
  {
    codeHash: { type: String, required: true },
    codeHint: { type: String, required: true },
    inviterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'reserved', 'accepted', 'revoked'],
      default: 'pending',
      required: true,
    },
    expiresAt: { type: Date, required: true },
    reservationId: { type: String },
    reservedAt: { type: Date },
    reservationExpiresAt: { type: Date },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

lifeInvitationSchema.index({ codeHash: 1, tenantId: 1 }, { unique: true });
lifeInvitationSchema.index({ inviterUserId: 1, createdAt: -1 });
lifeInvitationSchema.index({ acceptedByUserId: 1 }, { sparse: true });
lifeInvitationSchema.index({ status: 1, expiresAt: 1 });

export default lifeInvitationSchema;
