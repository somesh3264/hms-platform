'use server';

import { revalidatePath } from 'next/cache';

import { recordPayment } from '@/billing';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);
  const billId = String(formData.get('billId') ?? '');
  const path = billId ? `/billing/${billId}` : '/billing';

  try {
    const paymentMethod = formData.get('paymentMethod');
    if (
      !billId ||
      (paymentMethod !== 'UPI' && paymentMethod !== 'CASH' && paymentMethod !== 'CARD')
    ) {
      throw new Error('Missing billId or invalid payment method.');
    }
    const paymentReference = String(formData.get('paymentReference') ?? '').trim() || undefined;

    await withHospitalContext(hospitalId, (tx) =>
      recordPayment(tx, { hospitalId, actorId, billId, paymentMethod, paymentReference }),
    );
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to record payment.',
    });
  }

  revalidatePath('/billing');
  redirectWithFlash(path, { success: 'Payment recorded.' });
}
