import type { Prisma } from '@prisma/client';

// Full bill detail for the printable view (FR-7.6): hospital branding
// (name/logo/GSTIN), patient, and line items. Used to also select the
// visit's doctor for a "By: Dr. X" line on the printed bill -- dropped per
// a later, explicitly requested change (the hospital doesn't want the
// treating doctor's name on any bill), so the visit relation itself is no
// longer selected here at all.
export async function getBillDetail(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; billId: string },
) {
  const bill = await tx.bill.findFirst({
    where: { id: params.billId, hospitalId: params.hospitalId },
    include: {
      hospital: true,
      patient: true,
      lineItems: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!bill) {
    throw new Error(`Bill not found: ${params.billId}`);
  }

  return bill;
}
