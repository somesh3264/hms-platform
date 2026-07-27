import type { Prisma, User } from '@prisma/client';

// FR-2.2: all staff accounts for the Hospital Admin's user-management screen.
export async function listUsers(tx: Prisma.TransactionClient, hospitalId: string): Promise<User[]> {
  return tx.user.findMany({
    where: { hospitalId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}
