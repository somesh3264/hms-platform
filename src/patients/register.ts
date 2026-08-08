import type { Gender, Patient, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generatePatientCode } from './patient-code';

export interface RegisterPatientInput {
  hospitalId: string;
  actorId: string;
  name: string;
  age: number;
  gender?: Gender;
  phone: string;
  email?: string;
  address?: string;
  consentDigitalDelivery?: boolean;
  medicalHistoryNotes?: string;
}

// New patient registration (FR-3.2), auto-assigning a per-hospital patient
// ID (FR-3.3). Front desk staff are expected to call searchPatients first to
// avoid creating an unintentional duplicate -- this does not itself enforce
// uniqueness on name/phone, since those legitimately repeat (e.g. family
// members sharing a contact number). Age is entered directly as a whole
// number, not derived from a date of birth (a later, explicitly requested
// simplification) -- it's a snapshot as of registration, not something that
// keeps itself current in later years the way a stored DOB would.
export async function registerPatient(
  tx: Prisma.TransactionClient,
  input: RegisterPatientInput,
): Promise<Patient> {
  if (!input.name.trim()) {
    throw new Error('Name is required.');
  }
  if (!Number.isInteger(input.age) || input.age < 0 || input.age > 150) {
    throw new Error('Age must be a whole number between 0 and 150.');
  }
  if (!/^\d{10}$/.test(input.phone)) {
    throw new Error('Phone number must be exactly 10 digits.');
  }

  const patientCode = await generatePatientCode(tx, input.hospitalId);

  const patient = await tx.patient.create({
    data: {
      hospitalId: input.hospitalId,
      patientCode,
      name: input.name.trim(),
      age: input.age,
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
