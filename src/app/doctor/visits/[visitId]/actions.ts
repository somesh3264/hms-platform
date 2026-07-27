'use server';

import { revalidatePath } from 'next/cache';

import { uploadPrescription, replacePrescription } from '@/prescriptions';
import { requireSession, withHospitalContext } from '@/shared';
import { completeConsultation, saveConsultationNotes, startConsultation } from '@/visits';

async function readFileField(
  formData: FormData,
  key: string,
): Promise<{
  fileName: string;
  contentType: string;
  data: Buffer;
}> {
  const file = formData.get(key);
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('A file is required.');
  }
  return {
    fileName: file.name,
    contentType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  };
}

export async function startConsultationAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
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
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
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

export async function uploadPrescriptionAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  if (!visitId) {
    throw new Error('Missing visitId.');
  }
  const { fileName, contentType, data } = await readFileField(formData, 'file');

  await withHospitalContext(hospitalId, (tx) =>
    uploadPrescription(tx, { hospitalId, actorId, visitId, fileName, contentType, data }),
  );

  revalidatePath(`/doctor/visits/${visitId}`);
  revalidatePath('/pharmacy');
}

export async function replacePrescriptionAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  const prescriptionId = String(formData.get('prescriptionId') ?? '');
  if (!visitId || !prescriptionId) {
    throw new Error('Missing visitId or prescriptionId.');
  }
  const { fileName, contentType, data } = await readFileField(formData, 'file');

  await withHospitalContext(hospitalId, (tx) =>
    replacePrescription(tx, { hospitalId, actorId, prescriptionId, fileName, contentType, data }),
  );

  revalidatePath(`/doctor/visits/${visitId}`);
  revalidatePath('/pharmacy');
}

export async function completeConsultationAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  if (!visitId) {
    throw new Error('Missing visitId.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    completeConsultation(tx, { hospitalId, actorId, visitId }),
  );

  revalidatePath(`/doctor/visits/${visitId}`);
  revalidatePath('/doctor');
}
