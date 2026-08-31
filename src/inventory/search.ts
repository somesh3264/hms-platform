import type { Medicine, Prisma } from '@prisma/client';

// Search inventory by name, for pharmacy staff to select medicines to
// fulfil a prescription (FR-6.3). Defaults to active medicines only (see
// Medicine.isActive/listMedicines) -- dispensing/counter-sale search should
// never surface a deactivated medicine.
export async function searchMedicines(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; query: string; limit?: number; includeInactive?: boolean },
): Promise<Medicine[]> {
  const query = params.query.trim();
  if (!query) return [];

  return tx.medicine.findMany({
    where: {
      hospitalId: params.hospitalId,
      name: { contains: query, mode: 'insensitive' },
      ...(params.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: 'asc' },
    take: params.limit ?? 20,
  });
}
