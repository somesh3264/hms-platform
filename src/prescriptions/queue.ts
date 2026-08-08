import type { Prisma } from '@prisma/client';

// The pharmacy's incoming worklist (FR-6.1): prescriptions uploaded but not
// yet dispensed, oldest first (arrival order). This is FR-5.4's "automatic
// routing" made concrete -- there's no separate routing step or message
// broker, a prescription becomes visible here the instant its status is
// UPLOADED. Dispensing itself (selecting medicines, decrementing stock,
// marking DISPENSED -- FR-6.3/6.5/6.10) is the In-House Medical Store module
// (BRS 3.6) and isn't built yet; this is read-only.
export async function listPharmacyQueue(tx: Prisma.TransactionClient, hospitalId: string) {
  return tx.prescription.findMany({
    where: { hospitalId, status: 'UPLOADED' },
    orderBy: { createdAt: 'asc' },
    include: {
      patient: { select: { id: true, patientCode: true, name: true } },
      visit: { select: { id: true, department: true } },
      uploadedBy: { select: { id: true, name: true } },
    },
  });
}
