'use server';

import { updateMedicineDetails } from '@/inventory';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function updateMedicineDetailsAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const medicineId = optionalString(formData, 'medicineId');
  const path = medicineId ? `/pharmacy/inventory/${medicineId}/edit` : '/pharmacy/inventory';

  try {
    if (!medicineId) {
      throw new Error('Missing medicineId.');
    }
    const name = optionalString(formData, 'name');
    if (!name) {
      throw new Error('Name is required.');
    }
    const unitPriceRupees = Number(formData.get('unitPriceRupees'));
    const reorderLevel = Number(formData.get('reorderLevel'));
    if (!Number.isFinite(unitPriceRupees) || unitPriceRupees < 0) {
      throw new Error('A valid unit price is required.');
    }
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
      throw new Error('Reorder level must be a whole number, 0 or more.');
    }

    await withHospitalContext(hospitalId, (tx) =>
      updateMedicineDetails(tx, {
        hospitalId,
        actorId,
        medicineId,
        name,
        unitPriceCents: Math.round(unitPriceRupees * 100),
        reorderLevel,
      }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to update medicine.',
    });
  }

  redirectWithFlash('/pharmacy/inventory', { success: 'Medicine updated.' });
}
