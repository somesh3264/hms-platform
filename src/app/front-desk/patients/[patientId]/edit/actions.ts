'use server';

import type { Gender } from '@prisma/client';

import { updatePatientDemographics } from '@/patients';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function updatePatientAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);
  const patientId = optionalString(formData, 'patientId');
  const path = patientId ? `/front-desk/patients/${patientId}/edit` : '/front-desk';

  try {
    if (!patientId) {
      throw new Error('Missing patientId.');
    }
    const name = optionalString(formData, 'name');
    if (!name) {
      throw new Error('Name is required.');
    }
    const ageRaw = optionalString(formData, 'age');
    if (!ageRaw || !Number.isInteger(Number(ageRaw))) {
      throw new Error('Age must be a whole number.');
    }
    const gender = optionalString(formData, 'gender');
    if (!gender) {
      throw new Error('Gender is required.');
    }
    const phone = optionalString(formData, 'phone');
    if (!phone) {
      throw new Error('Phone number is required.');
    }
    // address is the one genuinely optional field here -- left blank means
    // "leave it as it already is," not "clear it" (updatePatientDemographics
    // only changes a field when it's present at all, same partial-update
    // shape as every other field on this input).
    const address = optionalString(formData, 'address');

    await withHospitalContext(hospitalId, (tx) =>
      updatePatientDemographics(tx, {
        hospitalId,
        actorId,
        patientId,
        name,
        age: Number(ageRaw),
        gender: gender as Gender,
        phone,
        ...(address ? { address } : {}),
      }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to update patient.',
    });
  }

  redirectWithFlash(`/patients/${patientId}`, { success: 'Patient details updated.' });
}
