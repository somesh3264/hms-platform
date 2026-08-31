import type { Medicine, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface UpdateMedicineDetailsInput {
  hospitalId: string;
  actorId: string;
  medicineId: string;
  name: string;
  unitPriceCents: number;
  reorderLevel: number;
}

// Edits an existing catalog entry's core details (a later, explicitly
// requested addition -- there was previously no way to fix any of these
// once added other than editing the database directly; started as a
// rename-only form, broadened to price and reorder level per explicit
// request once a dedicated edit screen replaced the old inline-per-row
// rename form). Deliberately not the full field set addMedicineStock/
// Medicine support (salt composition, expiry, low-stock threshold
// override) -- those were already cut from the "Add stock" form at
// pharmacy staff's own request for being more than a quick form needs;
// same reasoning applies here. Doesn't touch the name/batch dedupe
// matching in addMedicineStock -- if the new name happens to collide with
// another existing row's name+batch, that's the same no-DB-level-
// uniqueness situation already documented there, not something this
// function tries to prevent.
export async function updateMedicineDetails(
  tx: Prisma.TransactionClient,
  input: UpdateMedicineDetailsInput,
): Promise<Medicine> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Name is required.');
  }
  if (input.unitPriceCents < 0) {
    throw new Error('Unit price cannot be negative.');
  }
  if (input.reorderLevel < 0) {
    throw new Error('Reorder level cannot be negative.');
  }

  const { count } = await tx.medicine.updateMany({
    where: { id: input.medicineId, hospitalId: input.hospitalId },
    data: { name, unitPriceCents: input.unitPriceCents, reorderLevel: input.reorderLevel },
  });
  if (count === 0) {
    throw new Error(`Medicine not found: ${input.medicineId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'MEDICINE_UPDATED',
    entityType: 'Medicine',
    entityId: input.medicineId,
    metadata: { name, unitPriceCents: input.unitPriceCents, reorderLevel: input.reorderLevel },
  });

  return tx.medicine.findUniqueOrThrow({ where: { id: input.medicineId } });
}

export interface SetMedicineActiveInput {
  hospitalId: string;
  actorId: string;
  medicineId: string;
  isActive: boolean;
}

// Soft-delete/restore (a later, explicitly requested addition) -- see
// Medicine.isActive in prisma/schema.prisma for why this is a flag rather
// than a real DELETE (BillLineItem references would either block it or
// orphan billing history). Deactivating doesn't touch existing stock or
// billing records at all, only whether the medicine shows up in the
// dispense/counter-sale catalogs going forward (listMedicines/
// searchMedicines) and whether it can still be dispensed
// (dispenseItem/addCounterSaleItem's own atomic UPDATE also checks this).
export async function setMedicineActive(
  tx: Prisma.TransactionClient,
  input: SetMedicineActiveInput,
): Promise<Medicine> {
  const { count } = await tx.medicine.updateMany({
    where: { id: input.medicineId, hospitalId: input.hospitalId },
    data: { isActive: input.isActive },
  });
  if (count === 0) {
    throw new Error(`Medicine not found: ${input.medicineId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: input.isActive ? 'MEDICINE_REACTIVATED' : 'MEDICINE_DEACTIVATED',
    entityType: 'Medicine',
    entityId: input.medicineId,
  });

  return tx.medicine.findUniqueOrThrow({ where: { id: input.medicineId } });
}
