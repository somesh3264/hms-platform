'use server';

import { addMedicineStock } from '@/inventory';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function addMedicineStockAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);

  let merged = false;
  try {
    const name = optionalString(formData, 'name');
    if (!name) {
      throw new Error('Medicine name is required.');
    }
    const unitPriceRupees = Number(formData.get('unitPriceRupees'));
    const quantity = Number(formData.get('quantity'));
    if (!Number.isFinite(unitPriceRupees) || unitPriceRupees < 0) {
      throw new Error('A valid unit price is required.');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Quantity must be a positive number.');
    }
    const reorderLevelRaw = optionalString(formData, 'reorderLevel');
    const thresholdRaw = optionalString(formData, 'lowStockThresholdPercent');
    const expiryDateRaw = optionalString(formData, 'expiryDate');

    merged = await withHospitalContext(hospitalId, async (tx) => {
      const result = await addMedicineStock(tx, {
        hospitalId,
        actorId,
        name,
        saltComposition: optionalString(formData, 'saltComposition'),
        batchNumber: optionalString(formData, 'batchNumber'),
        expiryDate: expiryDateRaw ? new Date(expiryDateRaw) : undefined,
        unitPriceCents: Math.round(unitPriceRupees * 100),
        quantity,
        reorderLevel: reorderLevelRaw ? Number(reorderLevelRaw) : undefined,
        lowStockThresholdPercent: thresholdRaw ? Number(thresholdRaw) : undefined,
      });
      return result.merged;
    });
  } catch (err) {
    redirectWithFlash('/pharmacy/inventory', {
      error: err instanceof Error ? err.message : 'Failed to add medicine stock.',
    });
  }

  redirectWithFlash('/pharmacy/inventory', {
    success: merged ? 'Stock added to existing medicine.' : 'New medicine added to inventory.',
  });
}
