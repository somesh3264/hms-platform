import type { Prisma } from '@prisma/client';

// Queue/list view of patients waiting for a doctor (FR-3.5), FIFO by
// visitDate. Optionally scoped to a single doctor for the doctor's own queue
// (FR-4.2).
export async function listWaitingQueue(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; doctorId?: string },
) {
  return tx.visit.findMany({
    where: {
      hospitalId: params.hospitalId,
      status: 'WAITING',
      ...(params.doctorId ? { doctorId: params.doctorId } : {}),
    },
    orderBy: { visitDate: 'asc' },
    include: {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
    },
  });
}
