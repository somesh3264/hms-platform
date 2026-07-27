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

export async function registerPatientAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

  const firstName = optionalString(formData, 'firstName');
  const lastName = optionalString(formData, 'lastName');
  const dateOfBirthRaw = optionalString(formData, 'dateOfBirth');
  if (!firstName || !lastName || !dateOfBirthRaw) {
    throw new Error('First name, last name, and date of birth are required.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    registerPatient(tx, {
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
    }),
  );

  revalidatePath('/front-desk');
}

export async function createVisitAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

  const patientId = optionalString(formData, 'patientId');
  const doctorId = optionalString(formData, 'doctorId');
  if (!patientId || !doctorId) {
    throw new Error('A patient and doctor are required to create a visit.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    createVisit(tx, {
      hospitalId,
      actorId,
      patientId,
      doctorId,
      department: optionalString(formData, 'department'),
    }),
  );

  revalidatePath('/front-desk');
}
