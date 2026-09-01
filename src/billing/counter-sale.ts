import type { Bill, BillLineItem, PaymentMethod, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generateBillNumber } from './bill-number';
import { DEFAULT_TAX_PERCENT } from './constants';
import { recordPayment } from './payment';

export interface AddCounterSaleItemInput {
  hospitalId: string;
  actorId: string;
  patientId: string;
  medicineId: string;
  quantity: number;
}

// Dispenses one medicine directly to a walk-in with no doctor consultation
// involved (a later, explicitly requested feature -- see CLAUDE.md's
// "Counter Sale" section). A later, explicitly requested revision made this
// mirror dispenseItem's own one-medicine-at-a-time, atomic-stock-decrement
// shape (FR-6.5) exactly, so the interaction here matches the prescription
// dispense screen -- an earlier version combined item-selection and billing
// into one atomic step instead. The one real difference from dispenseItem:
// there's no Prescription to hang an unbilled line item off of (the
// existing billId-null convention), so the "cart" is a real Bill, created
// the moment the first item is dispensed (or reused, if one's already open
// for this patient) -- finalizeCounterSale below applies discount/tax and
// collects payment against that same Bill once dispensing is done.
export async function addCounterSaleItem(
  tx: Prisma.TransactionClient,
  input: AddCounterSaleItemInput,
): Promise<BillLineItem> {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be positive.');
  }

  const patient = await tx.patient.findFirst({
    where: { id: input.patientId, hospitalId: input.hospitalId },
    select: { id: true },
  });
  if (!patient) {
    throw new Error(`Patient not found: ${input.patientId}`);
  }

  let bill = await tx.bill.findFirst({
    where: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      visitId: null,
      paymentStatus: 'PENDING',
    },
  });
  if (!bill) {
    const billNumber = await generateBillNumber(tx, input.hospitalId);
    bill = await tx.bill.create({
      data: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        billNumber,
        subtotalCents: 0,
        discountCents: 0,
        taxCents: 0,
        totalCents: 0,
        paymentStatus: 'PENDING',
        issuedAt: new Date(),
      },
    });
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

  const lineTotalCents = medicine.unit_price_cents * input.quantity;

  const lineItem = await tx.billLineItem.create({
    data: {
      hospitalId: input.hospitalId,
      billId: bill.id,
      medicineId: input.medicineId,
      itemType: 'MEDICINE',
      description: medicine.name,
      quantity: input.quantity,
      unitPriceCents: medicine.unit_price_cents,
      lineTotalCents,
    },
  });
  await tx.bill.update({
    where: { id: bill.id },
    data: {
      subtotalCents: { increment: lineTotalCents },
      totalCents: { increment: lineTotalCents },
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'COUNTER_SALE_ITEM_DISPENSED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: {
      medicineId: input.medicineId,
      quantity: input.quantity,
      billLineItemId: lineItem.id,
    },
  });

  return lineItem;
}

export interface RemoveCounterSaleItemInput {
  hospitalId: string;
  actorId: string;
  billId: string;
  billLineItemId: string;
}

// Undoes a single dispensed item from an in-progress counter sale (a later,
// explicitly requested addition, mirroring removeDispensedItem in
// src/inventory/dispense.ts -- see there for the general rationale).
// Restores stock via the mirror image of addCounterSaleItem's own atomic
// decrement, then removes the line item and backs its amount out of the
// bill's running subtotal/total.
//
// Counter Sale's Bill exists from the moment the first item is dispensed
// (unlike the prescription flow, where billing happens later) -- so
// removing the *last* remaining item would otherwise leave a real
// billNumber attached to a permanently empty $0 Bill. Deleted outright in
// that case instead: paymentStatus is still PENDING and nothing else
// references it yet, so there's nothing to orphan (BillLineItem.billId's
// own ON DELETE SET NULL never comes into play here since every line item
// is already gone by the time the Bill itself is deleted).
export async function removeCounterSaleItem(
  tx: Prisma.TransactionClient,
  input: RemoveCounterSaleItemInput,
): Promise<void> {
  const bill = await tx.bill.findFirst({
    where: {
      id: input.billId,
      hospitalId: input.hospitalId,
      visitId: null,
      paymentStatus: 'PENDING',
    },
  });
  if (!bill) {
    throw new Error(`Counter sale not found or already finalized: ${input.billId}`);
  }

  const lineItem = await tx.billLineItem.findFirst({
    where: { id: input.billLineItemId, hospitalId: input.hospitalId, billId: bill.id },
  });
  if (!lineItem) {
    throw new Error(`Dispensed item not found: ${input.billLineItemId}`);
  }

  await tx.$executeRaw`
    UPDATE medicines
    SET stock_quantity = stock_quantity + ${lineItem.quantity}
    WHERE id = ${lineItem.medicineId} AND hospital_id = ${input.hospitalId}
  `;

  await tx.billLineItem.delete({ where: { id: lineItem.id } });

  const remaining = await tx.billLineItem.count({ where: { billId: bill.id } });
  if (remaining === 0) {
    await tx.bill.delete({ where: { id: bill.id } });
  } else {
    await tx.bill.update({
      where: { id: bill.id },
      data: {
        subtotalCents: { decrement: lineItem.lineTotalCents },
        totalCents: { decrement: lineItem.lineTotalCents },
      },
    });
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'COUNTER_SALE_ITEM_REMOVED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: {
      medicineId: lineItem.medicineId,
      quantity: lineItem.quantity,
      billLineItemId: lineItem.id,
    },
  });
}

export interface UpdateCounterSaleItemQuantityInput {
  hospitalId: string;
  actorId: string;
  billId: string;
  billLineItemId: string;
  quantity: number;
}

// Corrects the quantity of an already-dispensed Counter Sale item in place
// (a later, explicitly requested addition, mirroring
// updateDispensedItemQuantity in src/inventory/dispense.ts -- see there
// for the general rationale and the stock-adjustment shape). The one real
// difference from that prescription-flow version: a real Bill already
// exists here, so the line's lineTotalCents delta is also applied to the
// bill's running subtotalCents/totalCents, same as removeCounterSaleItem
// above does for a full removal.
export async function updateCounterSaleItemQuantity(
  tx: Prisma.TransactionClient,
  input: UpdateCounterSaleItemQuantityInput,
): Promise<void> {
  if (input.quantity <= 0) {
    throw new Error('Quantity must be positive.');
  }

  const bill = await tx.bill.findFirst({
    where: {
      id: input.billId,
      hospitalId: input.hospitalId,
      visitId: null,
      paymentStatus: 'PENDING',
    },
  });
  if (!bill) {
    throw new Error(`Counter sale not found or already finalized: ${input.billId}`);
  }

  const lineItem = await tx.billLineItem.findFirst({
    where: { id: input.billLineItemId, hospitalId: input.hospitalId, billId: bill.id },
  });
  if (!lineItem) {
    throw new Error(`Dispensed item not found: ${input.billLineItemId}`);
  }

  const quantityDelta = input.quantity - lineItem.quantity;
  if (quantityDelta > 0) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      UPDATE medicines
      SET stock_quantity = stock_quantity - ${quantityDelta}
      WHERE id = ${lineItem.medicineId}
        AND hospital_id = ${input.hospitalId}
        AND stock_quantity >= ${quantityDelta}
        AND is_active = true
      RETURNING id
    `;
    if (!row) {
      throw new Error(`Insufficient stock to increase quantity to ${input.quantity}.`);
    }
  } else if (quantityDelta < 0) {
    await tx.$executeRaw`
      UPDATE medicines
      SET stock_quantity = stock_quantity + ${-quantityDelta}
      WHERE id = ${lineItem.medicineId} AND hospital_id = ${input.hospitalId}
    `;
  }

  const newLineTotalCents = lineItem.unitPriceCents * input.quantity;
  const lineTotalDelta = newLineTotalCents - lineItem.lineTotalCents;

  await tx.billLineItem.update({
    where: { id: lineItem.id },
    data: { quantity: input.quantity, lineTotalCents: newLineTotalCents },
  });

  await tx.bill.update({
    where: { id: bill.id },
    data: {
      subtotalCents: { increment: lineTotalDelta },
      totalCents: { increment: lineTotalDelta },
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'COUNTER_SALE_ITEM_QUANTITY_UPDATED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: {
      medicineId: lineItem.medicineId,
      previousQuantity: lineItem.quantity,
      newQuantity: input.quantity,
      billLineItemId: lineItem.id,
    },
  });
}

export interface FinalizeCounterSaleInput {
  hospitalId: string;
  actorId: string;
  billId: string;
  discountCents?: number;
  discountPercent?: number;
  taxPercent?: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
}

// Closes out a counter sale -- applies the discount/tax entered at
// checkout, then records payment -- mirroring finalizeDispensing's "must
// have at least one dispensed item" gate one level up (that one closes a
// Prescription; this one closes a Bill directly, since a counter sale has
// no Prescription to gate on). Tax defaults the same way createBill's
// medicine bills already do (DEFAULT_TAX_PERCENT on the post-discount
// amount) -- a counter sale is still fundamentally a medicine sale, no
// reason for its tax treatment to differ.
export async function finalizeCounterSale(
  tx: Prisma.TransactionClient,
  input: FinalizeCounterSaleInput,
): Promise<Bill> {
  const bill = await tx.bill.findFirst({
    where: {
      id: input.billId,
      hospitalId: input.hospitalId,
      visitId: null,
      paymentStatus: 'PENDING',
    },
    include: { lineItems: true },
  });
  if (!bill) {
    throw new Error(`Counter sale not found or already finalized: ${input.billId}`);
  }
  if (bill.lineItems.length === 0) {
    throw new Error('Cannot finalize a sale before at least one medicine has been dispensed.');
  }

  // Discount percentage (a later, explicitly requested addition, matching
  // the same option on the medicine-bill-generation screen -- see
  // createBill) and the existing flat cash discount are mutually
  // exclusive, not stacked -- same reasoning as there. Resolved against
  // bill.subtotalCents, which addCounterSaleItem already keeps accurate as
  // items are dispensed, so this is the real subtotal, not a stale figure.
  if (input.discountCents && input.discountPercent) {
    throw new Error('Enter either a discount percentage or a cash discount, not both.');
  }
  if (
    input.discountPercent !== undefined &&
    (input.discountPercent < 0 || input.discountPercent > 100)
  ) {
    throw new Error('Discount percentage must be between 0 and 100.');
  }
  const discountCents = input.discountPercent
    ? Math.round(bill.subtotalCents * (input.discountPercent / 100))
    : (input.discountCents ?? 0);
  const taxPercent = input.taxPercent ?? DEFAULT_TAX_PERCENT;
  const taxableCents = Math.max(0, bill.subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * (taxPercent / 100));
  const totalCents = taxableCents + taxCents;

  await tx.bill.update({
    where: { id: bill.id },
    data: { discountCents, taxCents, totalCents },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'COUNTER_SALE_FINALIZED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: { totalCents, billNumber: bill.billNumber },
  });

  return recordPayment(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    billId: bill.id,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
  });
}
