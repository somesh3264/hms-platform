import type { Bill, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generateBillNumber } from './bill-number';
import { DEFAULT_TAX_PERCENT } from './constants';

export interface ServiceChargeInput {
  description: string;
  unitPriceCents: number;
  quantity?: number;
}

export interface CreateBillInput {
  hospitalId: string;
  actorId: string;
  visitId: string;
  serviceCharges?: ServiceChargeInput[];
  discountCents?: number;
  discountPercent?: number;
  taxPercent?: number;
}

// Generates a bill for a visit (FR-7.1/7.2): attaches every dispensed-but-
// unbilled BillLineItem for the visit (created by dispenseItem, billId
// null), plus any additional service charges -- e.g. a consultation fee
// (FR-7.3) -- created directly against the new bill. Tax is computed on the
// post-discount taxable amount (subtotal - discount), which is a common but
// not universal GST convention; taxPercent is caller-supplied per bill
// (defaulting to DEFAULT_TAX_PERCENT) rather than hardcoded, since actual
// GST slabs vary by item category and aren't modelled here (FR-7.4).
export async function createBill(
  tx: Prisma.TransactionClient,
  input: CreateBillInput,
): Promise<Bill> {
  const visit = await tx.visit.findFirst({
    where: { id: input.visitId, hospitalId: input.hospitalId },
    select: { id: true, patientId: true },
  });
  if (!visit) {
    throw new Error(`Visit not found: ${input.visitId}`);
  }

  const unbilledItems = await tx.billLineItem.findMany({
    where: { hospitalId: input.hospitalId, billId: null, prescription: { visitId: visit.id } },
  });

  const serviceCharges = input.serviceCharges ?? [];
  const serviceLineItems = serviceCharges.map((charge) => {
    const quantity = charge.quantity ?? 1;
    return {
      hospitalId: input.hospitalId,
      itemType: 'SERVICE' as const,
      description: charge.description,
      quantity,
      unitPriceCents: charge.unitPriceCents,
      lineTotalCents: charge.unitPriceCents * quantity,
    };
  });

  const subtotalCents =
    unbilledItems.reduce((sum, item) => sum + item.lineTotalCents, 0) +
    serviceLineItems.reduce((sum, item) => sum + item.lineTotalCents, 0);

  if (subtotalCents === 0) {
    throw new Error('Nothing to bill: no dispensed items or service charges for this visit.');
  }

  // Discount percentage (a later, explicitly requested addition) and the
  // existing flat cash discount are deliberately mutually exclusive, not
  // stacked -- picking one is simpler for front-of-till staff and avoids a
  // bill silently getting double-discounted if both happened to be filled
  // in. Resolved here (not by the caller) so the percentage is always a
  // percentage of the *real* subtotal computed just above, not a stale
  // figure the UI displayed earlier.
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
    ? Math.round(subtotalCents * (input.discountPercent / 100))
    : (input.discountCents ?? 0);
  const taxPercent = input.taxPercent ?? DEFAULT_TAX_PERCENT;
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * (taxPercent / 100));
  const totalCents = taxableCents + taxCents;

  const billNumber = await generateBillNumber(tx, input.hospitalId);

  const bill = await tx.bill.create({
    data: {
      hospitalId: input.hospitalId,
      visitId: visit.id,
      patientId: visit.patientId,
      billNumber,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
      paymentStatus: 'PENDING',
      issuedAt: new Date(),
    },
  });

  if (serviceLineItems.length > 0) {
    await tx.billLineItem.createMany({
      data: serviceLineItems.map((item) => ({ ...item, billId: bill.id })),
    });
  }

  if (unbilledItems.length > 0) {
    await tx.billLineItem.updateMany({
      where: { id: { in: unbilledItems.map((item) => item.id) }, hospitalId: input.hospitalId },
      data: { billId: bill.id },
    });
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'BILL_GENERATED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: { visitId: visit.id, totalCents, billNumber },
  });

  return bill;
}
