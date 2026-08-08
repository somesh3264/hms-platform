import type { Medicine, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface AddMedicineStockInput {
  hospitalId: string;
  actorId: string;
  name: string;
  saltComposition?: string;
  batchNumber?: string;
  expiryDate?: Date;
  unitPriceCents: number;
  quantity: number;
  reorderLevel?: number;
  lowStockThresholdPercent?: number;
}

// FR-6.4's "basic medicine inventory" had no way to actually populate it --
// only the seed script wrote Medicine rows. This is the missing write path:
// pharmacy staff restocking an existing medicine, or onboarding a new one,
// through the same form. There's no DB-level uniqueness on name/batch (see
// CLAUDE.md), so dedupe happens here -- matched on the same name
// (case-insensitive) and the same batch number (including two blank batch
// numbers matching each other, since most stock here isn't batch-tracked):
// a match increments the existing row's stock atomically rather than
// creating a duplicate-looking second row for the same medicine; unit price
// and expiry are updated to what was just entered (the latest information),
// since batch-level history isn't tracked separately. No match creates a
// brand new row, using the supplied reorder level (defaulting to 0).
export interface AddMedicineStockResult {
  medicine: Medicine;
  merged: boolean;
}

export async function addMedicineStock(
  tx: Prisma.TransactionClient,
  input: AddMedicineStockInput,
): Promise<AddMedicineStockResult> {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  if (input.unitPriceCents < 0) {
    throw new Error('Unit price cannot be negative.');
  }

  const existing = await tx.medicine.findFirst({
    where: {
      hospitalId: input.hospitalId,
      name: { equals: input.name, mode: 'insensitive' },
      batchNumber: input.batchNumber ?? null,
    },
  });

  let medicine: Medicine;
  if (existing) {
    medicine = await tx.medicine.update({
      where: { id: existing.id },
      data: {
        stockQuantity: { increment: input.quantity },
        unitPriceCents: input.unitPriceCents,
        ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate } : {}),
        ...(input.saltComposition !== undefined ? { saltComposition: input.saltComposition } : {}),
      },
    });
  } else {
    medicine = await tx.medicine.create({
      data: {
        hospitalId: input.hospitalId,
        name: input.name,
        saltComposition: input.saltComposition,
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate,
        unitPriceCents: input.unitPriceCents,
        stockQuantity: input.quantity,
        reorderLevel: input.reorderLevel ?? 0,
        lowStockThresholdPercent: input.lowStockThresholdPercent,
      },
    });
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: existing ? 'MEDICINE_RESTOCKED' : 'MEDICINE_CREATED',
    entityType: 'Medicine',
    entityId: medicine.id,
    metadata: { quantityAdded: input.quantity, newStockQuantity: medicine.stockQuantity },
  });

  return { medicine, merged: Boolean(existing) };
}
