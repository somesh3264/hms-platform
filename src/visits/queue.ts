import type { Prisma, VisitStatus } from '@prisma/client';

import { getISTDayBoundsUTC } from '@/shared';

// Queue/list view of patients waiting for a doctor (FR-3.5), FIFO by
// visitDate. Optionally scoped to a single doctor for the doctor's own queue
// (FR-4.2). Bounded to today (IST) -- without this, a visit nobody ever
// started or completed (a no-show, an abandoned booking, stale test data)
// would sit in front desk's queue forever, same reasoning as the doctor's
// own home screen already bounding to today via getISTDayBoundsUTC. A
// visit booked for a future date is likewise excluded until that day
// actually arrives -- it isn't something front desk needs to act on yet.
export async function listWaitingQueue(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; doctorId?: string },
) {
  const { start, end } = getISTDayBoundsUTC();

  return tx.visit.findMany({
    where: {
      hospitalId: params.hospitalId,
      status: 'WAITING',
      visitDate: { gte: start, lt: end },
      ...(params.doctorId ? { doctorId: params.doctorId } : {}),
    },
    orderBy: { visitDate: 'asc' },
    include: {
      patient: { select: { id: true, patientCode: true, name: true } },
      doctor: { select: { id: true, name: true } },
      // Front desk collects the consultation fee itself (immediately for a
      // walk-in, or here later once a booked visit's patient arrives) -- a
      // WAITING visit can only have a Bill from that collection step, since
      // dispensing (and so a medicine bill) requires IN_CONSULTATION first.
      // So "any PAID bill" reliably means "fee already collected."
      bills: { where: { paymentStatus: 'PAID' }, select: { id: true } },
    },
  });
}

// Front desk's own awareness of who's currently with a doctor (a later,
// explicitly requested addition -- see CLAUDE.md's "Front desk attaches
// prescription scans" section for why): the real workflow turned out to be
// the doctor writing the prescription on paper and calling front desk to
// scan it in, not the doctor uploading it themselves (no scanner in the
// consultation room) -- front desk needs to find the right visit during
// that call. Bounded to today (IST), same reasoning as listWaitingQueue
// above. Includes whether an UPLOADED prescription already exists so the
// front-desk queue can show "attached" vs. "not yet" without a separate
// query per row.
export async function listInConsultationVisits(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string },
) {
  const { start, end } = getISTDayBoundsUTC();

  return tx.visit.findMany({
    where: {
      hospitalId: params.hospitalId,
      status: 'IN_CONSULTATION',
      visitDate: { gte: start, lt: end },
    },
    orderBy: { visitDate: 'asc' },
    include: {
      patient: { select: { id: true, patientCode: true, name: true } },
      doctor: { select: { id: true, name: true } },
      prescriptions: { where: { status: 'UPLOADED' }, select: { id: true } },
    },
  });
}

// Front desk's own awareness of consultations finishing (a later,
// explicitly requested addition) -- previously front desk had zero
// visibility into a visit once it left WAITING (listWaitingQueue above
// only ever returns WAITING rows), so a patient's consultation could
// finish with no sign of it anywhere on the front-desk screen. Visit has
// no dedicated completedAt field; updatedAt is a safe stand-in here since
// completeConsultation's status write is the last change a COMPLETED visit
// ever receives.
export async function listRecentlyCompletedVisits(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; since: Date },
) {
  return tx.visit.findMany({
    where: {
      hospitalId: params.hospitalId,
      status: 'COMPLETED',
      updatedAt: { gte: params.since },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      patient: { select: { id: true, patientCode: true, name: true } },
      doctor: { select: { id: true, name: true } },
      // Lets the page show a reprint link without a per-row extra query --
      // unfiltered by paymentStatus (unlike listWaitingQueue's bills
      // select above), since a completed visit can also carry a
      // pharmacy-billed medicine Bill that's still PENDING, and front desk
      // should still be able to reach it to view/print.
      bills: { select: { id: true } },
      // Completing a consultation no longer waits on a prescription
      // existing first (see completeConsultation) -- this flags which
      // completed visits still need the scan attached, same as
      // listInConsultationVisits above.
      prescriptions: { where: { status: 'UPLOADED' }, select: { id: true } },
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
          name: true,
          age: true,
          gender: true,
          // Lets the doctor's queue flag returning patients (visits.length
          // includes this very visit, so >1 means there's at least one
          // other) without a separate query per row.
          _count: { select: { visits: true } },
        },
      },
    },
  });
}
