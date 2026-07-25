import type { Bill, PaymentMethod, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface RecordPaymentInput {
  hospitalId: string;
  actorId: string;
  billId: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
}

// Records that a bill was paid via UPI or Cash (FR-7.5) -- no insurance/TPA
// claim workflow (BRS Section 7, out of scope). paymentReference is the UPI
// UTR / transaction id, or a free-text cash receipt note; staff enter it
// after collecting payment via the hospital's existing UPI QR/handle, per
// the TRD -- this system only records that payment happened, it doesn't
// process it. Only valid while the bill is still PENDING, so a bill can't
// be marked paid twice.
export async function recordPayment(
  tx: Prisma.TransactionClient,
  input: RecordPaymentInput,
): Promise<Bill> {
  const { count } = await tx.bill.updateMany({
    where: { id: input.billId, hospitalId: input.hospitalId, paymentStatus: 'PENDING' },
    data: {
      paymentStatus: 'PAID',
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      paidAt: new Date(),
    },
  });
  if (count === 0) {
    throw new Error(`Bill not found or already paid: ${input.billId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'BILL_PAYMENT_RECORDED',
    entityType: 'Bill',
    entityId: input.billId,
    metadata: { paymentMethod: input.paymentMethod },
  });

  return tx.bill.findUniqueOrThrow({ where: { id: input.billId } });
}
