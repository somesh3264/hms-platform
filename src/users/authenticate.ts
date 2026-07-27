import { compare } from 'bcryptjs';
import type { Prisma, User } from '@prisma/client';

import { recordAuditLog } from '@/shared';

// FR-2.4: verifies email/password against the hospital-scoped User row and
// records a LOGIN audit entry (FR-2.5) on success. Returns null on any
// failure (unknown email, wrong password, inactive user) -- callers must not
// distinguish which, to avoid leaking which field was wrong.
export async function authenticateUser(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; email: string; password: string },
): Promise<User | null> {
  const user = await tx.user.findFirst({
    where: { hospitalId: params.hospitalId, email: params.email, isActive: true },
  });

  if (!user || !(await compare(params.password, user.passwordHash))) {
    return null;
  }

  await recordAuditLog(tx, {
    hospitalId: params.hospitalId,
    actorId: user.id,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
  });

  return user;
}
