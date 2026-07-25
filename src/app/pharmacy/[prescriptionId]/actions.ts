'use server';

import { revalidatePath } from 'next/cache';

import { dispenseItem, finalizeDispensing } from '@/inventory';
import { withHospitalContext } from '@/shared';
import { getDevPharmacistSession } from '@/shared/dev-session';

export async function dispenseItemAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await getDevPharmacistSession();
  const prescriptionId = String(formData.get('prescriptionId') ?? '');
  const medicineId = String(formData.get('medicineId') ?? '');
  const quantity = Number(formData.get('quantity'));
  if (!prescriptionId || !medicineId || !Number.isFinite(quantity)) {
    throw new Error('Missing prescriptionId, medicineId, or quantity.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    dispenseItem(tx, { hospitalId, actorId, prescriptionId, medicineId, quantity }),
  );

  revalidatePath(`/pharmacy/${prescriptionId}`);
  revalidatePath('/pharmacy');
  revalidatePath('/pharmacy/inventory');
  revalidatePath('/doctor');
}

export async function finalizeDispensingAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await getDevPharmacistSession();
  const prescriptionId = String(formData.get('prescriptionId') ?? '');
  if (!prescriptionId) {
    throw new Error('Missing prescriptionId.');
  }

  await withHospitalContext(hospitalId, (tx) =>
    finalizeDispensing(tx, { hospitalId, actorId, prescriptionId }),
  );

  revalidatePath(`/pharmacy/${prescriptionId}`);
  revalidatePath('/pharmacy');
}
