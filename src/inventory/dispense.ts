import type { BillLineItem, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface DispenseItemInput {
  hospitalId: string;
  actorId: string;
  prescriptionId: string;
  medicineId: string;
  quantity: number;
}

// Dispenses one medicine against a prescription (FR-6.3), decrementing stock
// in the same transaction (FR-6.5) via an atomic conditional UPDATE (not
// read-then-write), so concurrent dispensing at the same hospital can't
// oversell stock. Creates an unbilled BillLineItem (billId null) capturing
// what was dispensed and the price at the time -- the not-yet-built billing
// module attaches these to a real Bill later; this is deliberately
// repeatable per medicine (a prescription usually has several), with
// finalizeDispensing closing out the prescription once done.
export async function dispenseItem(
  tx: Prisma.TransactionClient,
  input: DispenseItemInput,
): Promise<BillLineItem> {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be positive.');
  }

  const prescription = await tx.prescription.findFirst({
    where: { id: input.prescriptionId, hospitalId: input.hospitalId, status: 'UPLOADED' },
    select: { id: true },
  });
  if (!prescription) {
    throw new Error(`Prescription not found or not dispensable: ${input.prescriptionId}`);
  }

  const [medicine] = await tx.$queryRaw<{ name: string; unit_price_cents: number }[]>`
    UPDATE medicines
    SET stock_quantity = stock_quantity - ${input.quantity}
    WHERE id = ${input.medicineId}
      AND hospital_id = ${input.hospitalId}
      AND stock_quantity >= ${input.quantity}
      AND is_active = true
    RETURNING name, unit_price_cents
  `;
  if (!medicine) {
    throw new Error(
      `Medicine not found, inactive, or insufficient stock: ${input.medicineId} (requested ${input.quantity})`,
    );
  }

  const lineItem = await tx.billLineItem.create({
    data: {
      hospitalId: input.hospitalId,
      prescriptionId: input.prescriptionId,
      medicineId: input.medicineId,
      itemType: 'MEDICINE',
      description: medicine.name,
      quantity: input.quantity,
      unitPriceCents: medicine.unit_price_cents,
      lineTotalCents: medicine.unit_price_cents * input.quantity,
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'PRESCRIPTION_ITEM_DISPENSED',
    entityType: 'Prescription',
    entityId: input.prescriptionId,
    metadata: {
      medicineId: input.medicineId,
      quantity: input.quantity,
      billLineItemId: lineItem.id,
    },
  });

  return lineItem;
}

export interface RemoveDispensedItemInput {
  hospitalId: string;
  actorId: string;
  prescriptionId: string;
  billLineItemId: string;
}

// Undoes a single dispensed line item (a later, explicitly requested
// addition -- there was previously no way to correct a wrong medicine or
// quantity picked by mistake short of a raw SQL fix). Restores stock via
// the mirror image of dispenseItem's own atomic decrement, then deletes
// the line item. Deliberately not gated on is_active -- the physical stock
// count being restored is real regardless of whether the medicine has
// since been deactivated for future dispensing.
//
// Gated on the prescription still being UPLOADED and the line item still
// unbilled (billId null), matching dispenseItem's own precondition -- in
// practice these two are never actually independent: a prescription only
// reaches DISPENSED via finalizeDispensing, and billId is only ever set
// later by createBill, by which point the dispense screen's own UPLOADED
// gate has already hidden every editable control on that page (see
// src/app/pharmacy/[prescriptionId]/page.tsx). Checked directly anyway
// rather than trusting the UI gate, same defense-in-depth as every other
// transition function here.
export async function removeDispensedItem(
  tx: Prisma.TransactionClient,
  input: RemoveDispensedItemInput,
): Promise<void> {
  const prescription = await tx.prescription.findFirst({
    where: { id: input.prescriptionId, hospitalId: input.hospitalId, status: 'UPLOADED' },
    select: { id: true },
  });
  if (!prescription) {
    throw new Error(`Prescription not found or not editable: ${input.prescriptionId}`);
  }

  const lineItem = await tx.billLineItem.findFirst({
    where: {
      id: input.billLineItemId,
      hospitalId: input.hospitalId,
      prescriptionId: input.prescriptionId,
      billId: null,
    },
  });
  if (!lineItem) {
    throw new Error(`Dispensed item not found or already billed: ${input.billLineItemId}`);
  }

  await tx.$executeRaw`
    UPDATE medicines
    SET stock_quantity = stock_quantity + ${lineItem.quantity}
    WHERE id = ${lineItem.medicineId} AND hospital_id = ${input.hospitalId}
  `;

  await tx.billLineItem.delete({ where: { id: lineItem.id } });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'PRESCRIPTION_ITEM_DISPENSE_REMOVED',
    entityType: 'Prescription',
    entityId: input.prescriptionId,
    metadata: {
      medicineId: lineItem.medicineId,
      quantity: lineItem.quantity,
      billLineItemId: lineItem.id,
    },
  });
}

export interface UpdateDispensedItemQuantityInput {
  hospitalId: string;
  actorId: string;
  prescriptionId: string;
  billLineItemId: string;
  quantity: number;
}

// Corrects the quantity of an already-dispensed line item in place (a
// later, explicitly requested addition, alongside removeDispensedItem
// above -- that one covers "wrong medicine entirely," this one covers
// "right medicine, wrong quantity" without a remove-then-redispense
// round trip). unitPriceCents is left untouched (it's the catalog price
// snapshot at dispense time, not something quantity should change) --
// only lineTotalCents is recomputed against it, which is what actually
// feeds the eventual bill's subtotal (see createBill).
//
// Adjusts stock by the signed difference rather than restore-then-redo:
// an increase re-runs dispenseItem's own atomic conditional decrement
// (so it can't oversell and requires the medicine still be active); a
// decrease unconditionally gives stock back, same as removeDispensedItem,
// since there's no floor to violate when returning stock. Same
// UPLOADED/unbilled gate as removeDispensedItem, for the same reason.
export async function updateDispensedItemQuantity(
  tx: Prisma.TransactionClient,
  input: UpdateDispensedItemQuantityInput,
): Promise<void> {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be positive.');
  }

  const prescription = await tx.prescription.findFirst({
    where: { id: input.prescriptionId, hospitalId: input.hospitalId, status: 'UPLOADED' },
    select: { id: true },
  });
  if (!prescription) {
    throw new Error(`Prescription not found or not editable: ${input.prescriptionId}`);
  }

  const lineItem = await tx.billLineItem.findFirst({
    where: {
      id: input.billLineItemId,
      hospitalId: input.hospitalId,
      prescriptionId: input.prescriptionId,
      billId: null,
    },
  });
  if (!lineItem) {
    throw new Error(`Dispensed item not found or already billed: ${input.billLineItemId}`);
  }

  const delta = input.quantity - lineItem.quantity;
  if (delta > 0) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      UPDATE medicines
      SET stock_quantity = stock_quantity - ${delta}
      WHERE id = ${lineItem.medicineId}
        AND hospital_id = ${input.hospitalId}
        AND stock_quantity >= ${delta}
        AND is_active = true
      RETURNING id
    `;
    if (!row) {
      throw new Error(`Insufficient stock to increase quantity to ${input.quantity}.`);
    }
  } else if (delta < 0) {
    await tx.$executeRaw`
      UPDATE medicines
      SET stock_quantity = stock_quantity + ${-delta}
      WHERE id = ${lineItem.medicineId} AND hospital_id = ${input.hospitalId}
    `;
  }

  await tx.billLineItem.update({
    where: { id: lineItem.id },
    data: { quantity: input.quantity, lineTotalCents: lineItem.unitPriceCents * input.quantity },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'PRESCRIPTION_ITEM_QUANTITY_UPDATED',
    entityType: 'Prescription',
    entityId: input.prescriptionId,
    metadata: {
      medicineId: lineItem.medicineId,
      previousQuantity: lineItem.quantity,
      newQuantity: input.quantity,
      billLineItemId: lineItem.id,
    },
  });
}

// Closes out a prescription once all needed medicines have been dispensed
// (FR-6.10), requiring at least one dispensed item -- mirrors
// completeConsultation's "requires a Prescription to exist" gate one level
// down.
export async function finalizeDispensing(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; actorId: string; prescriptionId: string },
): Promise<void> {
  const dispensedCount = await tx.billLineItem.count({
    where: { hospitalId: params.hospitalId, prescriptionId: params.prescriptionId },
  });
  if (dispensedCount === 0) {
    throw new Error('Cannot finalize dispensing before at least one medicine has been dispensed.');
  }

  const { count } = await tx.prescription.updateMany({
    where: { id: params.prescriptionId, hospitalId: params.hospitalId, status: 'UPLOADED' },
    data: { status: 'DISPENSED' },
  });
  if (count === 0) {
    throw new Error(`Prescription not found or not dispensable: ${params.prescriptionId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: params.hospitalId,
    actorId: params.actorId,
    action: 'PRESCRIPTION_DISPENSED',
    entityType: 'Prescription',
    entityId: params.prescriptionId,
  });
}
