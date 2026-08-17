'use server';

import { revalidatePath } from 'next/cache';

import { uploadPrescription, replacePrescription } from '@/prescriptions';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';
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
  const path = visitId ? `/doctor/visits/${visitId}` : '/doctor';

  try {
    if (!visitId) {
      throw new Error('Missing visitId.');
    }
    await withHospitalContext(hospitalId, (tx) =>
      startConsultation(tx, { hospitalId, actorId, visitId }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to start consultation.',
    });
  }

  // Not the page being redirected to -- redirect() alone only refreshes
  // the current navigation's target, not other already-open sessions
  // (e.g. this doctor's own /doctor home screen in another tab).
  revalidatePath('/doctor');
  redirectWithFlash(path, { success: 'Consultation started.' });
}

export async function saveNotesAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  const path = visitId ? `/doctor/visits/${visitId}` : '/doctor';

  try {
    if (!visitId) {
      throw new Error('Missing visitId.');
    }
    const notes = String(formData.get('notes') ?? '');
    await withHospitalContext(hospitalId, (tx) =>
      saveConsultationNotes(tx, { hospitalId, actorId, visitId, notes }),
    );
  } catch (err) {
    redirectWithFlash(path, { error: err instanceof Error ? err.message : 'Failed to save notes.' });
  }

  redirectWithFlash(path, { success: 'Notes saved.' });
}

export async function uploadPrescriptionAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  const path = visitId ? `/doctor/visits/${visitId}` : '/doctor';

  try {
    if (!visitId) {
      throw new Error('Missing visitId.');
    }
    const { fileName, contentType, data } = await readFileField(formData, 'file');
    await withHospitalContext(hospitalId, (tx) =>
      uploadPrescription(tx, { hospitalId, actorId, visitId, fileName, contentType, data }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to upload prescription.',
    });
  }

  revalidatePath('/pharmacy');
  redirectWithFlash(path, { success: 'Prescription uploaded — sent to the pharmacy queue.' });
}

export async function replacePrescriptionAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  const path = visitId ? `/doctor/visits/${visitId}` : '/doctor';

  try {
    const prescriptionId = String(formData.get('prescriptionId') ?? '');
    if (!visitId || !prescriptionId) {
      throw new Error('Missing visitId or prescriptionId.');
    }
    const { fileName, contentType, data } = await readFileField(formData, 'file');
    await withHospitalContext(hospitalId, (tx) =>
      replacePrescription(tx, { hospitalId, actorId, prescriptionId, fileName, contentType, data }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to replace prescription.',
    });
  }

  revalidatePath('/pharmacy');
  redirectWithFlash(path, { success: 'Prescription replaced — sent to the pharmacy queue.' });
}

export async function completeConsultationAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['DOCTOR']);
  const visitId = String(formData.get('visitId') ?? '');
  const path = visitId ? `/doctor/visits/${visitId}` : '/doctor';

  try {
    if (!visitId) {
      throw new Error('Missing visitId.');
    }
    await withHospitalContext(hospitalId, (tx) =>
      completeConsultation(tx, { hospitalId, actorId, visitId }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to complete consultation.',
    });
  }

  // Unlike the other actions on this page, success sends the doctor back to
  // the queue rather than staying on this visit -- completing a
  // consultation is naturally a "done here, on to the next patient" moment.
  revalidatePath('/doctor');
  redirectWithFlash('/doctor', { success: 'Consultation marked complete.' });
}
