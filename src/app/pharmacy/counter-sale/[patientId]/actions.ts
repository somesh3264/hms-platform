'use server';

import type { PaymentMethod } from '@prisma/client';

import { createCounterSale } from '@/billing';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Pairs up the fixed medicineId/quantity rows by position, same technique
// as collectFrontDeskChargesAction (src/app/front-desk/bill/[visitId]/
// actions.ts) -- FormData.getAll for two same-name field arrays, no
// per-row indices needed in the field names. A row needs both fields
// filled to count; a row with only one filled is rejected as a mistake
// rather than silently dropped, same as that action's own charge rows.
export async function completeCounterSaleAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const patientId = String(formData.get('patientId') ?? '');
  const errorPath = patientId ? `/pharmacy/counter-sale/${patientId}` : '/pharmacy/counter-sale';

  let billId = '';
  try {
    if (!patientId) {
      throw new Error('Missing patient.');
    }

    const medicineIds = formData.getAll('medicineId').map((value) => String(value).trim());
    const quantities = formData.getAll('quantity').map((value) => String(value).trim());

    const items: { medicineId: string; quantity: number }[] = [];
    for (let i = 0; i < medicineIds.length; i++) {
      const medicineId = medicineIds[i];
      const quantityRaw = quantities[i];
      if (!medicineId && !quantityRaw) {
        continue;
      }
      if (!medicineId || !quantityRaw) {
        throw new Error('Each row needs both a medicine and a quantity.');
      }
      const quantity = Number(quantityRaw);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error('Quantity must be a whole number greater than zero.');
      }
      items.push({ medicineId, quantity });
    }
    if (items.length === 0) {
      throw new Error('At least one medicine is required.');
    }

    const discountRupees = Number(formData.get('discountRupees') ?? 0);
    const taxPercent = Number(formData.get('taxPercent') ?? 0);
    const paymentMethod = optionalString(formData, 'paymentMethod');
    if (!paymentMethod) {
      throw new Error('A payment method is required.');
    }

    const bill = await withHospitalContext(hospitalId, (tx) =>
      createCounterSale(tx, {
        hospitalId,
        actorId,
        patientId,
        items,
        discountCents: Number.isFinite(discountRupees) ? Math.round(discountRupees * 100) : 0,
        taxPercent: Number.isFinite(taxPercent) ? taxPercent : undefined,
        paymentMethod: paymentMethod as PaymentMethod,
        paymentReference: optionalString(formData, 'paymentReference'),
      }),
    );
    billId = bill.id;
  } catch (err) {
    redirectWithFlash(errorPath, {
      error: err instanceof Error ? err.message : 'Failed to complete sale.',
    });
  }

  redirectWithFlash(`/billing/${billId}`, { success: 'Sale completed and payment collected.' });
}
