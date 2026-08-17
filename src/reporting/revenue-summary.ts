import type { Prisma } from '@prisma/client';

import { CONSULTATION_FEE_DESCRIPTION } from '@/billing';

export interface RevenueSummary {
  visitsCount: number;
  distinctPatientsCount: number;
  // Real money collected (bill totals, post-discount/tax) -- the headline
  // figure. Not the same sum as consultationFeeCents + otherFeeCents +
  // medicineCents below, which are gross per-line-item totals *before* any
  // bill-level discount or tax adjustment; a bill with a discount or a
  // nonzero tax rate means those three won't add up to totalRevenueCents
  // exactly. Both are useful, just answering different questions ("what did
  // we actually collect" vs "what was it made up of").
  totalRevenueCents: number;
  consultationFeeCents: number;
  otherFeeCents: number;
  medicineCents: number;
  byPaymentMethod: { CASH: number; UPI: number; CARD: number };
}

// Doctor-facing revenue reporting (BRS FR-9, the one piece of it built so
// far -- see CLAUDE.md). Deliberately scoped to one doctor's own
// visits/bills (via Visit.doctorId), not the whole hospital, matching every
// other query on the doctor's home screen (src/visits/queue.ts) -- this
// report lives on the doctor's own screen, not a hospital-wide admin one.
export async function getRevenueSummary(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; doctorId: string; from: Date; to: Date },
): Promise<RevenueSummary> {
  const visitWhere = {
    hospitalId: params.hospitalId,
    doctorId: params.doctorId,
    visitDate: { gte: params.from, lt: params.to },
  };

  const [visitsCount, distinctPatients, bills] = await Promise.all([
    tx.visit.count({ where: visitWhere }),
    tx.visit.groupBy({ by: ['patientId'], where: visitWhere }),
    tx.bill.findMany({
      where: {
        hospitalId: params.hospitalId,
        paymentStatus: 'PAID',
        paidAt: { gte: params.from, lt: params.to },
        visit: { doctorId: params.doctorId },
      },
      include: { lineItems: true },
    }),
  ]);

  const summary: RevenueSummary = {
    visitsCount,
    distinctPatientsCount: distinctPatients.length,
    totalRevenueCents: 0,
    consultationFeeCents: 0,
    otherFeeCents: 0,
    medicineCents: 0,
    byPaymentMethod: { CASH: 0, UPI: 0, CARD: 0 },
  };

  for (const bill of bills) {
    summary.totalRevenueCents += bill.totalCents;
    if (bill.paymentMethod) {
      summary.byPaymentMethod[bill.paymentMethod] += bill.totalCents;
    }
    for (const item of bill.lineItems) {
      if (item.itemType === 'MEDICINE') {
        summary.medicineCents += item.lineTotalCents;
      } else if (item.description === CONSULTATION_FEE_DESCRIPTION) {
        summary.consultationFeeCents += item.lineTotalCents;
      } else {
        summary.otherFeeCents += item.lineTotalCents;
      }
    }
  }

  return summary;
}
