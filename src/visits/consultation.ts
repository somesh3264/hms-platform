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

// Marks a consultation complete (FR-4.5). Per FR-4.5, this is only valid
// once a prescription has been uploaded against the visit -- so this
// requires a Prescription row to already exist. Prescription upload
// (BRS Module 3.5) isn't built yet, so this function is intentionally not
// wired to any UI yet: it would always reject. It's implemented now (and
// tested against a live database) so it's ready once that module lands.
export async function completeConsultation(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; actorId: string; visitId: string },
): Promise<void> {
  const prescriptionCount = await tx.prescription.count({
    where: { hospitalId: params.hospitalId, visitId: params.visitId },
  });
  if (prescriptionCount === 0) {
    throw new Error(
      'Cannot complete consultation before a prescription has been uploaded (FR-4.5).',
    );
  }

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
