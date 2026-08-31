import type { Medicine, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface UpdateMedicineNameInput {
  hospitalId: string;
  actorId: string;
  medicineId: string;
  name: string;
}

// Renames an existing catalog entry (a later, explicitly requested
// addition -- there was previously no way to fix a medicine name once
// added other than editing the database directly). Doesn't touch the
// name/batch dedupe matching in addMedicineStock -- if the rename happens
// to collide with another existing row's name+batch, that's the same
// no-DB-level-uniqueness situation already documented there, not something
// this function tries to prevent.
export async function updateMedicineName(
  tx: Prisma.TransactionClient,
  input: UpdateMedicineNameInput,
): Promise<Medicine> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Name is required.');
  }

  const { count } = await tx.medicine.updateMany({
    where: { id: input.medicineId, hospitalId: input.hospitalId },
    data: { name },
  });
  if (count === 0) {
    throw new Error(`Medicine not found: ${input.medicineId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'MEDICINE_RENAMED',
    entityType: 'Medicine',
    entityId: input.medicineId,
    metadata: { newName: name },
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
