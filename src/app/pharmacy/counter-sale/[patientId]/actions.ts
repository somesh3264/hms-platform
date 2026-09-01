'use server';

import type { PaymentMethod } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { addCounterSaleItem, finalizeCounterSale, removeCounterSaleItem } from '@/billing';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Mirrors dispenseItemAction (src/app/pharmacy/[prescriptionId]/actions.ts)
// exactly -- same medQuery-preserving redirect, same per-medicine submit.
export async function dispenseCounterSaleItemAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const patientId = String(formData.get('patientId') ?? '');
  const medQuery = optionalString(formData, 'medQuery');
  const basePath = patientId ? `/pharmacy/counter-sale/${patientId}` : '/pharmacy/counter-sale';
  const path = medQuery ? `${basePath}?medQuery=${encodeURIComponent(medQuery)}` : basePath;

  try {
    const medicineId = String(formData.get('medicineId') ?? '');
    const quantity = Number(formData.get('quantity'));
    if (!patientId || !medicineId || !Number.isFinite(quantity)) {
      throw new Error('Missing patient, medicineId, or quantity.');
    }
    await withHospitalContext(hospitalId, (tx) =>
      addCounterSaleItem(tx, { hospitalId, actorId, patientId, medicineId, quantity }),
    );
  } catch (err) {
    redirectWithFlash(path, { error: err instanceof Error ? err.message : 'Failed to dispense.' });
  }

  revalidatePath('/pharmacy/inventory');
  revalidatePath('/doctor');
  redirectWithFlash(path, { success: 'Medicine dispensed.' });
}

// Undoes a mis-picked medicine or quantity from "Dispensed so far" (see
// removeCounterSaleItem) -- one click, no confirmation, same shape as
// dispenseCounterSaleItemAction above.
export async function removeCounterSaleItemAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const patientId = String(formData.get('patientId') ?? '');
  const path = patientId ? `/pharmacy/counter-sale/${patientId}` : '/pharmacy/counter-sale';

  try {
    const billId = String(formData.get('billId') ?? '');
    const billLineItemId = String(formData.get('billLineItemId') ?? '');
    if (!billId || !billLineItemId) {
      throw new Error('Missing billId or billLineItemId.');
    }
    await withHospitalContext(hospitalId, (tx) =>
      removeCounterSaleItem(tx, { hospitalId, actorId, billId, billLineItemId }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to remove dispensed item.',
    });
  }

  revalidatePath('/pharmacy/inventory');
  revalidatePath('/doctor');
  redirectWithFlash(path, { success: 'Dispensed item removed and stock restored.' });
}

export async function finalizeCounterSaleAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const patientId = String(formData.get('patientId') ?? '');
  const billId = String(formData.get('billId') ?? '');
  const errorPath = patientId ? `/pharmacy/counter-sale/${patientId}` : '/pharmacy/counter-sale';

  let finalizedBillId = '';
  try {
    if (!billId) {
      throw new Error('Nothing dispensed yet -- dispense at least one medicine first.');
    }
    const discountRupees = Number(formData.get('discountRupees') ?? 0);
    const discountPercentRaw = String(formData.get('discountPercent') ?? '').trim();
    const discountPercent = discountPercentRaw ? Number(discountPercentRaw) : undefined;
    const taxPercent = Number(formData.get('taxPercent') ?? 0);
    const paymentMethod = optionalString(formData, 'paymentMethod');
    if (!paymentMethod) {
      throw new Error('A payment method is required.');
    }

    const bill = await withHospitalContext(hospitalId, (tx) =>
      finalizeCounterSale(tx, {
        hospitalId,
        actorId,
        billId,
        discountCents: Number.isFinite(discountRupees) ? Math.round(discountRupees * 100) : 0,
        discountPercent:
          discountPercent !== undefined && Number.isFinite(discountPercent)
            ? discountPercent
            : undefined,
        taxPercent: Number.isFinite(taxPercent) ? taxPercent : undefined,
        paymentMethod: paymentMethod as PaymentMethod,
        paymentReference: optionalString(formData, 'paymentReference'),
      }),
    );
    finalizedBillId = bill.id;
  } catch (err) {
    redirectWithFlash(errorPath, {
      error: err instanceof Error ? err.message : 'Failed to complete sale.',
    });
  }

  revalidatePath('/pharmacy/counter-sale');
  redirectWithFlash(`/billing/${finalizedBillId}`, {
    success: 'Sale completed and payment collected.',
  });
}
