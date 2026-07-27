'use server';

import { revalidatePath } from 'next/cache';

import { requireSession, withHospitalContext } from '@/shared';
import { saveHospitalLogo } from '@/shared/storage';
import { updateHospitalBranding } from '@/tenants';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function updateHospitalBrandingAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  const name = optionalString(formData, 'name');
  if (!name) {
    throw new Error('Hospital name is required.');
  }

  let logoUrl: string | undefined;
  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) {
    const saved = await saveHospitalLogo({
      hospitalId,
      fileName: logo.name,
      data: Buffer.from(await logo.arrayBuffer()),
    });
    logoUrl = saved.url;
  }

  await withHospitalContext(hospitalId, (tx) =>
    updateHospitalBranding(tx, {
      hospitalId,
      actorId,
      name,
      address: optionalString(formData, 'address'),
      contactPhone: optionalString(formData, 'contactPhone'),
      contactEmail: optionalString(formData, 'contactEmail'),
      gstin: optionalString(formData, 'gstin'),
      themeColor: optionalString(formData, 'themeColor'),
      logoUrl,
    }),
  );

  revalidatePath('/admin/hospital');
}
