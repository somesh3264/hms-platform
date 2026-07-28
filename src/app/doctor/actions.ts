'use server';

import { getISTDayBoundsUTC, redirectWithFlash, requireSession, withHospitalContext } from '@/shared';
import { startConsultation } from '@/visits';

// FR-4.10: one-click "begin consultation with the next waiting patient in
// queue order" from the doctor home screen -- queue order is by visitDate
// (appointment time), not token number (see src/visits/token-number.ts).
// Scoped to today's (IST) queue, matching the home screen it's called
// from. Picks and claims the visit in one transaction so two clicks (or
// two tabs) can't race onto the same visit -- startConsultation's own
// WAITING-scoped updateMany is already safe against a double-claim, but
// finding "next" needs the same atomicity.
export async function startNextWaitingAction(): Promise<void> {
  const { hospitalId, actorId: doctorId } = await requireSession(['DOCTOR']);
  const { start, end } = getISTDayBoundsUTC();

  const visitId = await withHospitalContext(hospitalId, async (tx) => {
    const next = await tx.visit.findFirst({
      where: {
        hospitalId,
        doctorId,
        status: 'WAITING',
        visitDate: { gte: start, lt: end },
      },
      orderBy: { visitDate: 'asc' },
      select: { id: true },
    });
    if (!next) {
      return null;
    }

    await startConsultation(tx, { hospitalId, actorId: doctorId, visitId: next.id });
    return next.id;
  });

  if (!visitId) {
    redirectWithFlash('/doctor', { error: "No waiting patients in today's queue." });
  }

  redirectWithFlash(`/doctor/visits/${visitId}`, { success: 'Consultation started.' });
}
