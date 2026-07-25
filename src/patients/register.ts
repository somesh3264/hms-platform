import type { Gender, Patient, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generatePatientCode } from './patient-code';

export interface RegisterPatientInput {
  hospitalId: string;
  actorId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender?: Gender;
  phone?: string;
  email?: string;
  address?: string;
  consentDigitalDelivery?: boolean;
  medicalHistoryNotes?: string;
}

// New patient registration (FR-3.2), auto-assigning a per-hospital patient
// ID (FR-3.3). Front desk staff are expected to call searchPatients first to
// avoid creating an unintentional duplicate -- this does not itself enforce
// uniqueness on name/phone, since those legitimately repeat (e.g. family
// members sharing a contact number).
export async function registerPatient(
  tx: Prisma.TransactionClient,
  input: RegisterPatientInput,
): Promise<Patient> {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new Error('First and last name are required.');
  }
  if (input.dateOfBirth.getTime() > Date.now()) {
    throw new Error('Date of birth cannot be in the future.');
  }

  const patientCode = await generatePatientCode(tx, input.hospitalId);

  const patient = await tx.patient.create({
    data: {
      hospitalId: input.hospitalId,
      patientCode,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      phone: input.phone,
      email: input.email,
      address: input.address,
      consentDigitalDelivery: input.consentDigitalDelivery ?? false,
      medicalHistoryNotes: input.medicalHistoryNotes,
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'PATIENT_REGISTERED',
    entityType: 'Patient',
    entityId: patient.id,
    metadata: { patientCode: patient.patientCode },
  });

  return patient;
}
