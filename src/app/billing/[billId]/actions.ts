'use server';

import { revalidatePath } from 'next/cache';

import { recordPayment } from '@/billing';
import { withHospitalContext } from '@/shared';
import { getDevBillingSession } from '@/shared/dev-session';

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await getDevBillingSession();
  const billId = String(formData.get('billId') ?? '');
  const paymentMethod = formData.get('paymentMethod');
  if (!billId || (paymentMethod !== 'UPI' && paymentMethod !== 'CASH')) {
    throw new Error('Missing billId or invalid payment method.');
  }
  const paymentReference = String(formData.get('paymentReference') ?? '').trim() || undefined;

  await withHospitalContext(hospitalId, (tx) =>
    recordPayment(tx, { hospitalId, actorId, billId, paymentMethod, paymentReference }),
  );

  revalidatePath(`/billing/${billId}`);
  revalidatePath('/billing');
}
