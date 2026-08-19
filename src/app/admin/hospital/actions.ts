'use server';

import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';
import { saveHospitalLogo, saveHospitalUpiQrCode } from '@/shared/storage';
import { updateHospitalBranding } from '@/tenants';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function updateHospitalBrandingAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  try {
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

    let upiQrCodeUrl: string | undefined;
    const upiQrCode = formData.get('upiQrCode');
    if (upiQrCode instanceof File && upiQrCode.size > 0) {
      const saved = await saveHospitalUpiQrCode({
        hospitalId,
        fileName: upiQrCode.name,
        data: Buffer.from(await upiQrCode.arrayBuffer()),
      });
      upiQrCodeUrl = saved.url;
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
        registrationNumber: optionalString(formData, 'registrationNumber'),
        themeColor: optionalString(formData, 'themeColor'),
        logoUrl,
        upiQrCodeUrl,
      }),
    );
  } catch (err) {
    redirectWithFlash('/admin/hospital', {
      error: err instanceof Error ? err.message : 'Failed to save hospital settings.',
    });
  }

  redirectWithFlash('/admin/hospital', { success: 'Hospital settings saved.' });
}
