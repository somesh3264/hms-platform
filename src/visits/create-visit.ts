import type { Prisma, Visit } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generateTokenNumber } from './token-number';

export interface CreateVisitInput {
  hospitalId: string;
  actorId: string;
  patientId: string;
  doctorId: string;
  department?: string;
  visitDate?: Date;
}

// Creates a new visit/encounter for a patient, assigned to a doctor (FR-3.4).
// One doctor per visit for Phase 1 (BRS Section 8, Decision #1).
export async function createVisit(
  tx: Prisma.TransactionClient,
  input: CreateVisitInput,
): Promise<Visit> {
  const patient = await tx.patient.findFirst({
    where: { id: input.patientId, hospitalId: input.hospitalId },
    select: { id: true },
  });
  if (!patient) {
    throw new Error(`Patient not found: ${input.patientId}`);
  }

  const doctor = await tx.user.findFirst({
    where: { id: input.doctorId, hospitalId: input.hospitalId, role: 'DOCTOR', isActive: true },
    select: { id: true },
  });
  if (!doctor) {
    throw new Error(`Active doctor not found: ${input.doctorId}`);
  }

  const tokenNumber = await generateTokenNumber(tx, input.hospitalId);

  const visit = await tx.visit.create({
    data: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      department: input.department,
      visitDate: input.visitDate ?? new Date(),
      tokenNumber,
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'VISIT_CREATED',
    entityType: 'Visit',
    entityId: visit.id,
    metadata: { patientId: visit.patientId, doctorId: visit.doctorId },
  });

  return visit;
}
