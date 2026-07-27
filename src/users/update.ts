import type { Prisma, User, UserRole } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface UpdateUserInput {
  hospitalId: string;
  actorId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  isActive: boolean;
}

// FR-2.2: Hospital Admin editing or deactivating a staff account. Includes
// isActive here rather than a separate function since both are the same
// "edit this user" screen/form.
export async function updateUser(
  tx: Prisma.TransactionClient,
  input: UpdateUserInput,
): Promise<User> {
  if (!input.name.trim()) {
    throw new Error('Name is required.');
  }
  if (input.userId === input.actorId && !input.isActive) {
    throw new Error('You cannot deactivate your own account.');
  }

  const duplicate = await tx.user.findFirst({
    where: { hospitalId: input.hospitalId, email: input.email, NOT: { id: input.userId } },
  });
  if (duplicate) {
    throw new Error(`A user with email ${input.email} already exists.`);
  }

  const { count } = await tx.user.updateMany({
    where: { id: input.userId, hospitalId: input.hospitalId },
    data: {
      name: input.name.trim(),
      email: input.email,
      role: input.role,
      department: input.department ?? null,
      isActive: input.isActive,
    },
  });
  if (count === 0) {
    throw new Error(`User not found: ${input.userId}`);
  }

  const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: user.id,
    metadata: { role: user.role, isActive: user.isActive },
  });

  return user;
}
