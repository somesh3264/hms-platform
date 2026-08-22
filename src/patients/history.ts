import type { Prisma } from '@prisma/client';

// Patient demographics plus their full visit/prescription history (FR-4.1,
// FR-8.1), most recent visit first.
export async function getPatientHistory(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; patientId: string },
) {
  const patient = await tx.patient.findFirst({
    where: { id: params.patientId, hospitalId: params.hospitalId },
  });
  if (!patient) {
    throw new Error(`Patient not found: ${params.patientId}`);
  }

  const visits = await tx.visit.findMany({
    where: { hospitalId: params.hospitalId, patientId: params.patientId },
    orderBy: { visitDate: 'desc' },
    include: {
      doctor: { select: { id: true, name: true } },
      prescriptions: {
        select: { id: true, status: true, createdAt: true, fileUrl: true, fileType: true },
      },
      bills: {
        select: { id: true, billNumber: true, totalCents: true, paymentStatus: true, issuedAt: true },
      },
    },
  });

  // Counter Sale bills (src/billing/counter-sale.ts) have no Visit to show
  // up under above -- a walk-in medicine purchase with no doctor
  // consultation involved. Surfaced here separately so they're still
  // visible on the patient's own record, not just findable via /billing's
  // general search.
  const otherBills = await tx.bill.findMany({
    where: { hospitalId: params.hospitalId, patientId: params.patientId, visitId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, billNumber: true, totalCents: true, paymentStatus: true, issuedAt: true },
  });

  return { patient, visits, otherBills };
}
