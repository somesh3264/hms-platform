import type { Medicine, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface AdjustMedicineStockInput {
  hospitalId: string;
  actorId: string;
  medicineId: string;
  quantity: number;
  reason: string;
}

// Corrects a medicine's stock count directly to match a physical count (a
// later, explicitly requested addition). addMedicineStock only ever adds,
// and dispenseItem/addCounterSaleItem only ever subtract through a real
// sale -- there was previously no way to fix the count itself once it
// drifts from what's actually on the shelf (e.g. medicine handed out
// without going through the app at all). Sets stockQuantity to the
// entered absolute value rather than a signed delta -- staff read a
// physical count off the shelf and type that number directly, not a
// correction amount they'd have to work out by hand.
//
// Deliberately HOSPITAL_ADMIN-only, not PHARMACIST like every other
// inventory action -- an unaudited-looking write straight to the stock
// count is exactly the kind of control that could otherwise be used to
// quietly cover up a shortfall, so this stays with the role positioned to
// ask "why," not the role that might have caused the discrepancy. A
// reason is required and stored on the audit log entry for the same
// reason -- there's no free pass to silently overwrite a count.
export async function adjustMedicineStock(
  tx: Prisma.TransactionClient,
  input: AdjustMedicineStockInput,
): Promise<Medicine> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    throw new Error('Quantity must be a whole number, 0 or more.');
  }
  if (!input.reason.trim()) {
    throw new Error('A reason is required.');
  }

  const medicine = await tx.medicine.findFirst({
    where: { id: input.medicineId, hospitalId: input.hospitalId },
    select: { id: true, stockQuantity: true },
  });
  if (!medicine) {
    throw new Error(`Medicine not found: ${input.medicineId}`);
  }

  const updated = await tx.medicine.update({
    where: { id: medicine.id },
    data: { stockQuantity: input.quantity },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'MEDICINE_STOCK_ADJUSTED',
    entityType: 'Medicine',
    entityId: medicine.id,
    metadata: {
      previousQuantity: medicine.stockQuantity,
      newQuantity: input.quantity,
      reason: input.reason.trim(),
    },
  });

  return updated;
}
