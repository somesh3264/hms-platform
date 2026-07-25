import type { Prisma } from '@prisma/client';

// Full bill detail for the printable view (FR-7.6): hospital branding
// (name/logo/GSTIN), patient/visit, and line items.
export async function getBillDetail(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; billId: string },
) {
  const bill = await tx.bill.findFirst({
    where: { id: params.billId, hospitalId: params.hospitalId },
    include: {
      hospital: true,
      patient: true,
      visit: { select: { id: true, visitDate: true, department: true } },
      lineItems: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!bill) {
    throw new Error(`Bill not found: ${params.billId}`);
  }

  return bill;
}
