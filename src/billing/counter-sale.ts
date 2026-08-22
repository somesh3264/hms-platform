import type { Bill, PaymentMethod, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { DEFAULT_TAX_PERCENT } from './constants';
import { generateBillNumber } from './bill-number';
import { recordPayment } from './payment';

export interface CounterSaleItemInput {
  medicineId: string;
  quantity: number;
}

export interface CreateCounterSaleInput {
  hospitalId: string;
  actorId: string;
  patientId: string;
  items: CounterSaleItemInput[];
  discountCents?: number;
  taxPercent?: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
}

// A walk-in buying medicine with no doctor consultation involved (a later,
// explicitly requested feature -- see CLAUDE.md's "Counter sale" section):
// no Visit, no Prescription, none of the existing doctor-consultation
// dispensing pipeline touched. Deliberately its own function rather than a
// variant of dispenseItem/createBill: those are both anchored on a
// Prescription/Visit that doesn't exist here.
//
// Combines what dispenseItem and collectFrontDeskCharges each do
// separately into one atomic step, since there's no reason to split
// "dispense" from "bill" when nothing is deferred: stock is decremented
// per medicine via the same atomic conditional UPDATE dispenseItem uses
// (not read-then-write, so concurrent counter sales can't oversell), the
// resulting line items are attached directly to a new Bill (no unbilled-
// then-swept-up intermediate state), and payment is recorded in the same
// step, exactly like collectFrontDeskCharges's own walk-in-pays-right-now
// shape. Tax defaults the same way createBill's medicine bills already do
// (DEFAULT_TAX_PERCENT on the post-discount amount) -- a counter sale is
// still fundamentally a medicine sale, no reason for its tax treatment to
// differ.
export async function createCounterSale(
  tx: Prisma.TransactionClient,
  input: CreateCounterSaleInput,
): Promise<Bill> {
  if (input.items.length === 0) {
    throw new Error('At least one medicine is required.');
  }
  for (const item of input.items) {
    if (item.quantity <= 0) {
      throw new Error('Quantity must be positive.');
    }
  }

  const patient = await tx.patient.findFirst({
    where: { id: input.patientId, hospitalId: input.hospitalId },
    select: { id: true },
  });
  if (!patient) {
    throw new Error(`Patient not found: ${input.patientId}`);
  }

  let subtotalCents = 0;
  const lineItemsData: Prisma.BillLineItemCreateManyBillInput[] = [];
  for (const item of input.items) {
    const [medicine] = await tx.$queryRaw<{ name: string; unit_price_cents: number }[]>`
      UPDATE medicines
      SET stock_quantity = stock_quantity - ${item.quantity}
      WHERE id = ${item.medicineId}
        AND hospital_id = ${input.hospitalId}
        AND stock_quantity >= ${item.quantity}
      RETURNING name, unit_price_cents
    `;
    if (!medicine) {
      throw new Error(
        `Medicine not found or insufficient stock: ${item.medicineId} (requested ${item.quantity})`,
      );
    }

    const lineTotalCents = medicine.unit_price_cents * item.quantity;
    subtotalCents += lineTotalCents;
    lineItemsData.push({
      hospitalId: input.hospitalId,
      medicineId: item.medicineId,
      itemType: 'MEDICINE',
      description: medicine.name,
      quantity: item.quantity,
      unitPriceCents: medicine.unit_price_cents,
      lineTotalCents,
    });
  }

  const discountCents = input.discountCents ?? 0;
  const taxPercent = input.taxPercent ?? DEFAULT_TAX_PERCENT;
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * (taxPercent / 100));
  const totalCents = taxableCents + taxCents;

  const billNumber = await generateBillNumber(tx, input.hospitalId);

  const bill = await tx.bill.create({
    data: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      billNumber,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
      paymentStatus: 'PENDING',
      issuedAt: new Date(),
      lineItems: { createMany: { data: lineItemsData } },
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'COUNTER_SALE_GENERATED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: { patientId: input.patientId, totalCents, billNumber },
  });

  return recordPayment(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    billId: bill.id,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
  });
}
