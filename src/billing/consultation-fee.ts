import type { Bill, PaymentMethod, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generateBillNumber } from './bill-number';
import { recordPayment } from './payment';

export interface CollectConsultationFeeInput {
  hospitalId: string;
  actorId: string;
  visitId: string;
  feeCents: number;
  discountCents?: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
}

// Front desk collects the consultation fee itself -- immediately for a
// walk-in, or later when a booked appointment's patient arrives (see
// src/app/front-desk/actions.ts). Deliberately its own Bill built directly
// here rather than delegating to createBill: createBill also sweeps in any
// dispensed-but-unbilled medicine line items for the visit, which would
// wrongly merge a later medicine bill into what's meant to stay a
// standalone reception-desk fee. No tax -- this is a flat fee collected at
// the counter, not an itemized/taxed medicine bill. Paid in the same step
// it's created (not left PENDING like createBill's bills) since the money
// changes hands right there at the counter.
export async function collectConsultationFee(
  tx: Prisma.TransactionClient,
  input: CollectConsultationFeeInput,
): Promise<Bill> {
  const visit = await tx.visit.findFirst({
    where: { id: input.visitId, hospitalId: input.hospitalId },
    select: { id: true, patientId: true },
  });
  if (!visit) {
    throw new Error(`Visit not found: ${input.visitId}`);
  }

  if (input.feeCents <= 0) {
    throw new Error('Consultation fee must be greater than zero.');
  }

  const discountCents = input.discountCents ?? 0;
  const totalCents = Math.max(0, input.feeCents - discountCents);
  const billNumber = await generateBillNumber(tx, input.hospitalId);

  const bill = await tx.bill.create({
    data: {
      hospitalId: input.hospitalId,
      visitId: visit.id,
      patientId: visit.patientId,
      billNumber,
      subtotalCents: input.feeCents,
      discountCents,
      taxCents: 0,
      totalCents,
      paymentStatus: 'PENDING',
      issuedAt: new Date(),
      lineItems: {
        create: {
          hospitalId: input.hospitalId,
          itemType: 'SERVICE',
          description: 'Consultation fee',
          quantity: 1,
          unitPriceCents: input.feeCents,
          lineTotalCents: input.feeCents,
        },
      },
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'CONSULTATION_FEE_COLLECTED',
    entityType: 'Bill',
    entityId: bill.id,
    metadata: { visitId: visit.id, totalCents, billNumber },
  });

  return recordPayment(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    billId: bill.id,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
  });
}
