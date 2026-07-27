import { hash } from 'bcryptjs';
import type { Prisma, User, UserRole } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface CreateUserInput {
  hospitalId: string;
  actorId: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string;
}

// FR-2.2: Hospital Admin creating a new staff account within their hospital.
export async function createUser(
  tx: Prisma.TransactionClient,
  input: CreateUserInput,
): Promise<User> {
  if (!input.name.trim()) {
    throw new Error('Name is required.');
  }
  if (input.password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const existing = await tx.user.findFirst({
    where: { hospitalId: input.hospitalId, email: input.email },
  });
  if (existing) {
    throw new Error(`A user with email ${input.email} already exists.`);
  }

  const passwordHash = await hash(input.password, 10);
  const user = await tx.user.create({
    data: {
      hospitalId: input.hospitalId,
      name: input.name.trim(),
      email: input.email,
      passwordHash,
      role: input.role,
      department: input.department,
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    metadata: { role: user.role },
  });

  return user;
}
