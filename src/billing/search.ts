import type { Prisma } from '@prisma/client';

// Billing history search by patient, date, or bill number (FR-7.7). Return
// type is inferred (not annotated as Bill[]) so the included `patient`
// relation stays visible to callers.
export async function searchBills(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; query?: string; date?: Date; limit?: number },
) {
  const query = params.query?.trim();

  const where: Prisma.BillWhereInput = { hospitalId: params.hospitalId };

  if (query) {
    where.OR = [
      { billNumber: { contains: query, mode: 'insensitive' } },
      { patient: { firstName: { contains: query, mode: 'insensitive' } } },
      { patient: { lastName: { contains: query, mode: 'insensitive' } } },
      { patient: { patientCode: { contains: query, mode: 'insensitive' } } },
    ];
  }

  if (params.date) {
    const startOfDay = new Date(params.date);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfNextDay = new Date(startOfDay);
    startOfNextDay.setDate(startOfNextDay.getDate() + 1);
    where.createdAt = { gte: startOfDay, lt: startOfNextDay };
  }

  return tx.bill.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 50,
    include: { patient: { select: { firstName: true, lastName: true, patientCode: true } } },
  });
}
