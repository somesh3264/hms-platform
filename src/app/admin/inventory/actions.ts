'use server';

import { adjustMedicineStock } from '@/inventory';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function adjustMedicineStockAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['HOSPITAL_ADMIN']);

  try {
    const medicineId = optionalString(formData, 'medicineId');
    if (!medicineId) {
      throw new Error('Missing medicineId.');
    }
    const quantity = Number(formData.get('quantity'));
    if (!Number.isFinite(quantity)) {
      throw new Error('A valid quantity is required.');
    }
    const reason = optionalString(formData, 'reason');
    if (!reason) {
      throw new Error('A reason is required.');
    }

    await withHospitalContext(hospitalId, (tx) =>
      adjustMedicineStock(tx, { hospitalId, actorId, medicineId, quantity, reason }),
    );
  } catch (err) {
    redirectWithFlash('/admin/inventory', {
      error: err instanceof Error ? err.message : 'Failed to adjust stock.',
    });
  }

  redirectWithFlash('/admin/inventory', { success: 'Stock corrected.' });
}
