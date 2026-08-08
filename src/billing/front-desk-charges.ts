import type { Bill, PaymentMethod, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generateBillNumber } from './bill-number';
import { recordPayment } from './payment';

export interface FrontDeskChargeInput {
  description: string;
  amountCents: number;
}

export interface CollectFrontDeskChargesInput {
  hospitalId: string;
  actorId: string;
  visitId: string;
  charges: FrontDeskChargeInput[];
  discountCents?: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  auditAction?: string;
}

// Generalizes collectConsultationFee (which now delegates here) to any
// number of named charges -- e.g. surgery or other procedure fees, not just
// the consultation fee -- combined into one Bill with one payment
// collection. Deliberately its own Bill built directly here rather than
// delegating to createBill: createBill also sweeps in any
// dispensed-but-unbilled medicine line items for the visit, which would
// wrongly merge a later medicine bill into what's meant to stay a
// standalone reception-desk bill. No tax -- these are flat fees collected
// at the counter, not an itemized/taxed medicine bill. Paid in the same
// step it's created (not left PENDING like createBill's bills) since the
// money changes hands right there at the counter.
export async function collectFrontDeskCharges(
  tx: Prisma.TransactionClient,
  input: CollectFrontDeskChargesInput,
): Promise<Bill> {
  if (input.charges.length === 0) {
    throw new Error('At least one charge is required.');
  }
  for (const charge of input.charges) {
    if (!charge.description.trim()) {
      throw new Error('Each charge needs a description.');
    }
    if (charge.amountCents <= 0) {
      throw new Error(`"${charge.description}" must have an amount greater than zero.`);
    }
  }

  const visit = await tx.visit.findFirst({
    where: { id: input.visitId, hospitalId: input.hospitalId },
    select: { id: true, patientId: true },
  });
  if (!visit) {
    throw new Error(`Visit not found: ${input.visitId}`);
  }

  const subtotalCents = input.charges.reduce((sum, charge) => sum + charge.amountCents, 0);
  const discountCents = input.discountCents ?? 0;
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const billNumber = await generateBillNumber(tx, input.hospitalId);

  const bill = await tx.bill.create({
    data: {
      hospitalId: input.hospitalId,
      visitId: visit.id,
      patientId: visit.patientId,
      billNumber,
      subtotalCents,
      discountCents,
      taxCents: 0,
      totalCents,
      paymentStatus: 'PENDING',
      issuedAt: new Date(),
      lineItems: {
        create: input.charges.map((charge) => ({
          hospitalId: input.hospitalId,
          itemType: 'SERVICE' as const,
          description: charge.description,
          quantity: 1,
          unitPriceCents: charge.amountCents,
          lineTotalCents: charge.amountCents,
        })),
      },
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: input.auditAction ?? 'FRONT_DESK_BILL_COLLECTED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: {
      visitId: visit.id,
      totalCents,
      billNumber,
      charges: input.charges.map((c) => c.description),
    },
  });

  return recordPayment(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    billId: bill.id,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
  });
}
