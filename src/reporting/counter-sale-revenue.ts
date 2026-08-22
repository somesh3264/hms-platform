import type { Prisma } from '@prisma/client';

export interface CounterSaleRevenue {
  salesCount: number;
  totalRevenueCents: number;
  byPaymentMethod: { CASH: number; UPI: number; CARD: number };
}

// Counter Sale bills (src/billing/counter-sale.ts) have no Visit -- a
// walk-in buying medicine with no doctor consultation involved -- so
// getRevenueSummary's Visit.doctorId scoping can never surface them; a
// counter sale isn't "owned" by any doctor to filter by in the first
// place. This is a second, deliberately hospital-wide query (identified by
// visitId: null, the one thing that distinguishes a counter sale bill from
// every other bill-creation path, which always sets it) shown on the
// doctor reports screen alongside the per-doctor summary -- a later,
// explicitly requested addition so a doctor isn't left wondering where
// that revenue went, even though it was never theirs to begin with.
export async function getCounterSaleRevenue(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; from: Date; to: Date },
): Promise<CounterSaleRevenue> {
  const bills = await tx.bill.findMany({
    where: {
      hospitalId: params.hospitalId,
      visitId: null,
      paymentStatus: 'PAID',
      paidAt: { gte: params.from, lt: params.to },
    },
    select: { totalCents: true, paymentMethod: true },
  });

  const summary: CounterSaleRevenue = {
    salesCount: bills.length,
    totalRevenueCents: 0,
    byPaymentMethod: { CASH: 0, UPI: 0, CARD: 0 },
  };

  for (const bill of bills) {
    summary.totalRevenueCents += bill.totalCents;
    if (bill.paymentMethod) {
      summary.byPaymentMethod[bill.paymentMethod] += bill.totalCents;
    }
  }

  return summary;
}
