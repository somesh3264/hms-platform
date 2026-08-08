import type { Gender, Patient, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

export interface UpdatePatientDemographicsInput {
  hospitalId: string;
  actorId: string;
  patientId: string;
  name?: string;
  age?: number;
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

  if (changes.name !== undefined && !changes.name.trim()) {
    throw new Error('Name cannot be empty.');
  }
  if (
    changes.age !== undefined &&
    (!Number.isInteger(changes.age) || changes.age < 0 || changes.age > 150)
  ) {
    throw new Error('Age must be a whole number between 0 and 150.');
  }
  if (changes.phone !== undefined && !/^\d{10}$/.test(changes.phone)) {
    throw new Error('Phone number must be exactly 10 digits.');
  }

  // hospitalId is part of the UPDATE's WHERE clause (not just relied on via
  // RLS) so a mismatched patientId/hospitalId updates zero rows instead of
  // relying solely on the database layer to reject it.
  const { count } = await tx.patient.updateMany({
    where: { id: patientId, hospitalId },
    data: {
      ...changes,
      name: changes.name?.trim(),
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
