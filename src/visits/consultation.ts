import type { Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

// Opens a waiting visit for consultation (FR-4.3). Only valid from WAITING,
// so re-opening an already-completed or cancelled visit is rejected rather
// than silently resurrecting it.
export async function startConsultation(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; actorId: string; visitId: string },
): Promise<void> {
  const { count } = await tx.visit.updateMany({
    where: { id: params.visitId, hospitalId: params.hospitalId, status: 'WAITING' },
    data: { status: 'IN_CONSULTATION' },
  });
  if (count === 0) {
    throw new Error(`Visit not found or not waiting: ${params.visitId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: params.hospitalId,
    actorId: params.actorId,
    action: 'CONSULTATION_STARTED',
    entityType: 'Visit',
    entityId: params.visitId,
  });
}

// Saves the doctor's free-text consultation notes (FR-4.4, optional field).
// Only valid while the visit is actively in consultation.
export async function saveConsultationNotes(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; actorId: string; visitId: string; notes: string },
): Promise<void> {
  const { count } = await tx.visit.updateMany({
    where: { id: params.visitId, hospitalId: params.hospitalId, status: 'IN_CONSULTATION' },
    data: { consultationNotes: params.notes },
  });
  if (count === 0) {
    throw new Error(`Visit not found or not in consultation: ${params.visitId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: params.hospitalId,
    actorId: params.actorId,
    action: 'CONSULTATION_NOTES_SAVED',
    entityType: 'Visit',
    entityId: params.visitId,
  });
}

// Marks a consultation complete (FR-4.5). FR-4.5 originally required a
// prescription to already exist first -- a later, explicitly requested
// change dropped that gate: the real workflow has the doctor writing the
// prescription on paper and calling front desk to scan it in (see
// CLAUDE.md's "Front desk attaches prescription scans" section), which can
// take a while, and the doctor needs to move on to the next waiting patient
// in the meantime rather than being blocked on that call finishing. The
// prescription can now be attached after the visit is COMPLETED too (see
// uploadPrescription/replacePrescription) -- front desk's "Completed today"
// list flags which completed visits are still missing one.
export async function completeConsultation(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; actorId: string; visitId: string },
): Promise<void> {
  const { count } = await tx.visit.updateMany({
    where: { id: params.visitId, hospitalId: params.hospitalId, status: 'IN_CONSULTATION' },
    data: { status: 'COMPLETED' },
  });
  if (count === 0) {
    throw new Error(`Visit not found or not in consultation: ${params.visitId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: params.hospitalId,
    actorId: params.actorId,
    action: 'CONSULTATION_COMPLETED',
    entityType: 'Visit',
    entityId: params.visitId,
  });
}

// Marks a visit as a no-show (a later, explicitly requested addition, no
// FR number) -- front desk's resolution for a booked/waiting patient who
// never arrived. Reuses the schema's existing CANCELLED status rather than
// adding a new enum value: it was already sitting unused (only read by
// StatusBadge and the doctor visit-detail page), and startConsultation's
// own comment above already anticipated rejecting a re-open attempt
// against it. Only valid from WAITING, same one-way-terminal shape as
// completeConsultation -- once marked, the visit stays CANCELLED; if the
// patient does show up later, front desk books them a fresh visit rather
// than reopening this one.
export async function markVisitNoShow(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; actorId: string; visitId: string },
): Promise<void> {
  const { count } = await tx.visit.updateMany({
    where: { id: params.visitId, hospitalId: params.hospitalId, status: 'WAITING' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new Error(`Visit not found or not waiting: ${params.visitId}`);
  }

  await recordAuditLog(tx, {
    hospitalId: params.hospitalId,
    actorId: params.actorId,
    action: 'VISIT_NO_SHOW',
    entityType: 'Visit',
    entityId: params.visitId,
  });
}
