'use server';

import { revalidatePath } from 'next/cache';

import { replacePrescription, uploadPrescription } from '@/prescriptions';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

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

// Mirrors uploadPrescriptionAction/replacePrescriptionAction on the
// doctor's own visit page (src/app/doctor/visits/[visitId]/actions.ts)
// exactly -- same underlying uploadPrescription/replacePrescription calls,
// just reachable by FRONT_DESK too (see CLAUDE.md's "Front desk attaches
// prescription scans" section). uploadPrescription itself doesn't care
// which role calls it; the only real gate is the visit already being
// IN_CONSULTATION, unchanged here.
export async function uploadPrescriptionAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);
  const visitId = String(formData.get('visitId') ?? '');
  const path = visitId ? `/front-desk/visit/${visitId}` : '/front-desk';

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
  revalidatePath('/front-desk');
  redirectWithFlash(path, { success: 'Prescription uploaded — sent to the pharmacy queue.' });
}

export async function replacePrescriptionAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);
  const visitId = String(formData.get('visitId') ?? '');
  const path = visitId ? `/front-desk/visit/${visitId}` : '/front-desk';

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
