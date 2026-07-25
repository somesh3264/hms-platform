'use server';

import { revalidatePath } from 'next/cache';

import { withHospitalContext } from '@/shared';
import { getDevDoctorSession } from '@/shared/dev-session';
import { saveConsultationNotes, startConsultation } from '@/visits';

export async function startConsultationAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await getDevDoctorSession();
  const visitId = String(formData.get('visitId') ?? '');
  if (!visitId) {
    throw new Error('Missing visitId.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    startConsultation(tx, { hospitalId, actorId, visitId }),
  );

  revalidatePath(`/doctor/visits/${visitId}`);
  revalidatePath('/doctor');
}

export async function saveNotesAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await getDevDoctorSession();
  const visitId = String(formData.get('visitId') ?? '');
  if (!visitId) {
    throw new Error('Missing visitId.');
  }
  const notes = String(formData.get('notes') ?? '');

  await withHospitalContext(hospitalId, (tx) =>
    saveConsultationNotes(tx, { hospitalId, actorId, visitId, notes }),
  );

  revalidatePath(`/doctor/visits/${visitId}`);
}
