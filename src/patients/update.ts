import type { Gender, Patient, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface UpdatePatientDemographicsInput {
  hospitalId: string;
  actorId: string;
  patientId: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  phone?: string;
  email?: string;
  address?: string;
  consentDigitalDelivery?: boolean;
  medicalHistoryNotes?: string;
}

// Updates a patient's demographic details on a subsequent visit (FR-3.6).
export async function updatePatientDemographics(
  tx: Prisma.TransactionClient,
  input: UpdatePatientDemographicsInput,
): Promise<Patient> {
  const { hospitalId, actorId, patientId, ...changes } = input;

  if (changes.firstName !== undefined && !changes.firstName.trim()) {
    throw new Error('First name cannot be empty.');
  }
  if (changes.lastName !== undefined && !changes.lastName.trim()) {
    throw new Error('Last name cannot be empty.');
  }

  // hospitalId is part of the UPDATE's WHERE clause (not just relied on via
  // RLS) so a mismatched patientId/hospitalId updates zero rows instead of
  // relying solely on the database layer to reject it.
  const { count } = await tx.patient.updateMany({
    where: { id: patientId, hospitalId },
    data: {
      ...changes,
      firstName: changes.firstName?.trim(),
      lastName: changes.lastName?.trim(),
    },
  });
  if (count === 0) {
    throw new Error(`Patient not found: ${patientId}`);
  }
  const patient = await tx.patient.findUniqueOrThrow({ where: { id: patientId } });

  await recordAuditLog(tx, {
    hospitalId,
    actorId,
    action: 'PATIENT_DEMOGRAPHICS_UPDATED',
    entityType: 'Patient',
    entityId: patient.id,
    metadata: { fields: Object.keys(changes) },
  });

  return patient;
}
