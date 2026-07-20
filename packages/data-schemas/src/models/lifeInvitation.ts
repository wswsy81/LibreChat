import type { Model } from 'mongoose';
import type { ILifeInvitation } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import lifeInvitationSchema from '~/schema/lifeInvitation';

export function createLifeInvitationModel(
  mongoose: typeof import('mongoose'),
): Model<ILifeInvitation> {
  applyTenantIsolation(lifeInvitationSchema);
  return (
    mongoose.models.LifeInvitation ||
    mongoose.model<ILifeInvitation>('LifeInvitation', lifeInvitationSchema)
  );
}
