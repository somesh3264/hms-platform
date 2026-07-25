import type { Prisma } from '@prisma/client';

import { getExpiryStatus, isLowStock } from './status';

// Full inventory listing (FR-6.4) with computed low-stock (FR-6.6/6.7) and
// near-expiry (FR-6.9) flags, for the pharmacy inventory screen.
export async function listMedicines(tx: Prisma.TransactionClient, hospitalId: string) {
  const hospital = await tx.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { lowStockThresholdPercent: true },
  });

  const medicines = await tx.medicine.findMany({
    where: { hospitalId },
    orderBy: { name: 'asc' },
  });

  return medicines.map((medicine) => ({
    ...medicine,
    isLowStock: isLowStock(medicine, hospital),
    ...getExpiryStatus(medicine),
  }));
}

// Low-stock medicines only (FR-6.8): surfaced to both pharmacy staff and
// doctors, so a doctor is aware stock is limited when prescribing.
export async function listLowStockMedicines(tx: Prisma.TransactionClient, hospitalId: string) {
  const medicines = await listMedicines(tx, hospitalId);
  return medicines.filter((medicine) => medicine.isLowStock);
}
