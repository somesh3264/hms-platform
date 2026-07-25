import type { Prisma, VisitStatus } from '@prisma/client';

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

// A single doctor's visits across one or more statuses (FR-4.2), e.g. their
// waiting queue plus any visit they left mid-consultation to resume.
export async function listVisitsForDoctor(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; doctorId: string; statuses: VisitStatus[] },
) {
  return tx.visit.findMany({
    where: {
      hospitalId: params.hospitalId,
      doctorId: params.doctorId,
      status: { in: params.statuses },
    },
    orderBy: { visitDate: 'asc' },
    include: {
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
    },
  });
}
