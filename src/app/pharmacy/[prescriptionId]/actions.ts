'use server';

import { revalidatePath } from 'next/cache';

import { dispenseItem, finalizeDispensing } from '@/inventory';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export async function dispenseItemAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const prescriptionId = String(formData.get('prescriptionId') ?? '');
  const medQuery = optionalString(formData, 'medQuery');
  const basePath = prescriptionId ? `/pharmacy/${prescriptionId}` : '/pharmacy';
  const path = medQuery ? `${basePath}?medQuery=${encodeURIComponent(medQuery)}` : basePath;

  try {
    const medicineId = String(formData.get('medicineId') ?? '');
    const quantity = Number(formData.get('quantity'));
    if (!prescriptionId || !medicineId || !Number.isFinite(quantity)) {
      throw new Error('Missing prescriptionId, medicineId, or quantity.');
    }
    await withHospitalContext(hospitalId, (tx) =>
      dispenseItem(tx, { hospitalId, actorId, prescriptionId, medicineId, quantity }),
    );
  } catch (err) {
    redirectWithFlash(path, { error: err instanceof Error ? err.message : 'Failed to dispense.' });
  }

  revalidatePath('/pharmacy/inventory');
  revalidatePath('/doctor');
  redirectWithFlash(path, { success: 'Medicine dispensed.' });
}

export async function finalizeDispensingAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const prescriptionId = String(formData.get('prescriptionId') ?? '');
  const path = prescriptionId ? `/pharmacy/${prescriptionId}` : '/pharmacy';

  try {
    if (!prescriptionId) {
      throw new Error('Missing prescriptionId.');
    }
    await withHospitalContext(hospitalId, (tx) =>
      finalizeDispensing(tx, { hospitalId, actorId, prescriptionId }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to finalize dispensing.',
    });
  }

  revalidatePath('/pharmacy');
  redirectWithFlash(path, { success: 'Dispensing finalized.' });
}
