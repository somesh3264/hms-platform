import type { Prisma } from '@prisma/client';

// Visits with at least one dispensed-but-unbilled line item (FR-7.1), ready
// for a bill to be generated. Reachable via Prescription -> BillLineItem
// since dispensing (src/inventory/dispense.ts) creates unbilled
// (billId null) line items linked by prescriptionId, not visitId directly.
export async function listVisitsReadyToBill(tx: Prisma.TransactionClient, hospitalId: string) {
  return tx.visit.findMany({
    where: {
      hospitalId,
      prescriptions: { some: { billLineItems: { some: { billId: null } } } },
    },
    orderBy: { visitDate: 'desc' },
    include: {
      patient: { select: { id: true, patientCode: true, name: true } },
    },
  });
}
