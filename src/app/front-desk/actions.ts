'use server';

import { revalidatePath } from 'next/cache';

import type { Gender } from '@prisma/client';

import { registerPatient } from '@/patients';
import { requireSession, withHospitalContext } from '@/shared';
import { createVisit } from '@/visits';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Parses a <input type="datetime-local"> value (e.g. "2026-07-25T18:30"),
// which carries no timezone -- interpreted as the server's local time, same
// convention already used for the <input type="date"> dateOfBirth field.
function parseDateTimeLocal(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid appointment date/time.');
  }
  return parsed;
}

export async function registerPatientAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

  const firstName = optionalString(formData, 'firstName');
  const lastName = optionalString(formData, 'lastName');
  const dateOfBirthRaw = optionalString(formData, 'dateOfBirth');
  if (!firstName || !lastName || !dateOfBirthRaw) {
    throw new Error('First name, last name, and date of birth are required.');
  }

  // Assigning a doctor is optional here -- if chosen, a visit/appointment is
  // created for the new patient in the same step (FR-3.2 + FR-3.4 combined,
  // matching the common front-desk workflow of a walk-in registering and
  // immediately being queued); left blank, this just registers the patient
  // as before, and a visit can still be created later via the search results
  // above (createVisitAction).
  const doctorId = optionalString(formData, 'doctorId');
  const visitDate = parseDateTimeLocal(optionalString(formData, 'visitDate'));

  await withHospitalContext(hospitalId, async (tx) => {
    const patient = await registerPatient(tx, {
      hospitalId,
      actorId,
      firstName,
      lastName,
      dateOfBirth: new Date(dateOfBirthRaw),
      gender: optionalString(formData, 'gender') as Gender | undefined,
      phone: optionalString(formData, 'phone'),
      email: optionalString(formData, 'email'),
      address: optionalString(formData, 'address'),
      consentDigitalDelivery: formData.get('consentDigitalDelivery') === 'on',
    });

    if (doctorId) {
      await createVisit(tx, { hospitalId, actorId, patientId: patient.id, doctorId, visitDate });
    }
  });

  revalidatePath('/front-desk');
}

export async function createVisitAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

  const patientId = optionalString(formData, 'patientId');
  const doctorId = optionalString(formData, 'doctorId');
  if (!patientId || !doctorId) {
    throw new Error('A patient and doctor are required to create a visit.');
  }
  const visitDate = parseDateTimeLocal(optionalString(formData, 'visitDate'));

  await withHospitalContext(hospitalId, (tx) =>
    createVisit(tx, {
      hospitalId,
      actorId,
      patientId,
      doctorId,
      department: optionalString(formData, 'department'),
      visitDate,
    }),
  );

  revalidatePath('/front-desk');
}
