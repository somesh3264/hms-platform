'use server';

import { addMedicineStock, setMedicineActive } from '@/inventory';
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

    merged = await withHospitalContext(hospitalId, async (tx) => {
      const result = await addMedicineStock(tx, {
        hospitalId,
        actorId,
        name,
        unitPriceCents: Math.round(unitPriceRupees * 100),
        quantity,
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

// Shared by both the "Deactivate" and "Reactivate" buttons -- a hidden
// isActive field distinguishes which one was clicked (see
// Medicine.isActive in prisma/schema.prisma for why this is a toggle
// rather than a real delete).
export async function setMedicineActiveAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);

  let isActive = false;
  try {
    const medicineId = optionalString(formData, 'medicineId');
    if (!medicineId) {
      throw new Error('Missing medicineId.');
    }
    isActive = formData.get('isActive') === 'true';
    await withHospitalContext(hospitalId, (tx) =>
      setMedicineActive(tx, { hospitalId, actorId, medicineId, isActive }),
    );
  } catch (err) {
    redirectWithFlash('/pharmacy/inventory', {
      error: err instanceof Error ? err.message : 'Failed to update medicine.',
    });
  }

  redirectWithFlash('/pharmacy/inventory', {
    success: isActive ? 'Medicine reactivated.' : 'Medicine deactivated.',
  });
}
