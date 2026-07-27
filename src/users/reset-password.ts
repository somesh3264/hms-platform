import { hash } from 'bcryptjs';
import type { Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface ResetUserPasswordInput {
  hospitalId: string;
  actorId: string;
  userId: string;
  newPassword: string;
}

// FR-2.2: Hospital Admin resetting a staff member's password (e.g. after a
// lockout) -- there's no self-service "forgot password" flow, so this is
// the only recovery path.
export async function resetUserPassword(
  tx: Prisma.TransactionClient,
  input: ResetUserPasswordInput,
): Promise<void> {
  if (input.newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const passwordHash = await hash(input.newPassword, 10);
  const { count } = await tx.user.updateMany({
    where: { id: input.userId, hospitalId: input.hospitalId },
    data: { passwordHash },
  });
  if (count === 0) {
    throw new Error(`User not found: ${input.userId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'USER_PASSWORD_RESET',
    entityType: 'User',
    entityId: input.userId,
  });
}
