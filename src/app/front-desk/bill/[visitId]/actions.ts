'use server';

import type { PaymentMethod } from '@prisma/client';

import { collectFrontDeskCharges } from '@/billing';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Front desk billing for surgery/other procedures (a later, explicitly
// requested addition alongside consultation-fee collection -- see
// src/billing/front-desk-charges.ts): up to CHARGE_ROWS blank
// description+amount pairs, rendered as repeated same-name fields so
// FormData.getAll pairs them up by position without any client-side JS to
// add/remove rows. A row needs both fields filled to count; a row with only
// one filled is a mistake, not a silent partial charge, so it's rejected
// rather than dropped.
export async function collectFrontDeskChargesAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);
  const visitId = String(formData.get('visitId') ?? '');
  const errorPath = visitId ? `/front-desk/bill/${visitId}` : '/front-desk';

  let billId: string;
  try {
    if (!visitId) {
      throw new Error('Missing visit.');
    }

    const descriptions = formData.getAll('chargeDescription').map((value) => String(value).trim());
    const amounts = formData.getAll('chargeAmount').map((value) => String(value).trim());

    const charges: { description: string; amountCents: number }[] = [];
    for (let i = 0; i < descriptions.length; i++) {
      const description = descriptions[i];
      const amountRaw = amounts[i];
      if (!description && !amountRaw) {
        continue;
      }
      if (!description || !amountRaw) {
        throw new Error('Each charge needs both a description and an amount.');
      }
      const amountRupees = Number(amountRaw);
      if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
        throw new Error(`"${description}" needs a valid amount.`);
      }
      charges.push({ description, amountCents: Math.round(amountRupees * 100) });
    }
    if (charges.length === 0) {
      throw new Error('At least one charge is required.');
    }

    const discountRupees = Number(formData.get('discountRupees') ?? 0);
    const paymentMethod = optionalString(formData, 'paymentMethod');
    if (!paymentMethod) {
      throw new Error('A payment method is required.');
    }

    const bill = await withHospitalContext(hospitalId, (tx) =>
      collectFrontDeskCharges(tx, {
        hospitalId,
        actorId,
        visitId,
        charges,
        discountCents: Number.isFinite(discountRupees) ? Math.round(discountRupees * 100) : 0,
        paymentMethod: paymentMethod as PaymentMethod,
      }),
    );
    billId = bill.id;
  } catch (err) {
    redirectWithFlash(errorPath, {
      error: err instanceof Error ? err.message : 'Failed to generate bill.',
    });
  }

  redirectWithFlash(`/billing/${billId}`, { success: 'Bill generated and payment collected.' });
}
