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

export interface FinalizeCounterSaleInput {
  hospitalId: string;
  actorId: string;
  billId: string;
  discountCents?: number;
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

  const discountCents = input.discountCents ?? 0;
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
