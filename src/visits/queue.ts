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
// Optionally bounded to a visitDate range (FR-4.6: "today's queue" on the
// doctor home screen -- see src/shared/ist-date.ts's getISTDayBoundsUTC).
export async function listVisitsForDoctor(
  tx: Prisma.TransactionClient,
  params: {
    hospitalId: string;
    doctorId: string;
    statuses: VisitStatus[];
    visitDateFrom?: Date;
    visitDateTo?: Date;
  },
) {
  return tx.visit.findMany({
    where: {
      hospitalId: params.hospitalId,
      doctorId: params.doctorId,
      status: { in: params.statuses },
      ...(params.visitDateFrom && params.visitDateTo
        ? { visitDate: { gte: params.visitDateFrom, lt: params.visitDateTo } }
        : {}),
    },
    orderBy: { visitDate: 'asc' },
    include: {
      patient: {
        select: {
          id: true,
          patientCode: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          gender: true,
        },
      },
    },
  });
}
