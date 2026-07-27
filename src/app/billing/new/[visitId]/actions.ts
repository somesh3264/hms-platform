'use server';

import { redirect } from 'next/navigation';

import { createBill } from '@/billing';
import { requireSession, withHospitalContext } from '@/shared';

export async function generateBillAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['BILLING_STAFF']);
  const visitId = String(formData.get('visitId') ?? '');
  if (!visitId) {
    throw new Error('Missing visitId.');
  }

  const serviceDescription = String(formData.get('serviceDescription') ?? '').trim();
  const serviceFeeRupees = Number(formData.get('serviceFeeRupees'));
  const discountRupees = Number(formData.get('discountRupees') ?? 0);
  const taxPercent = Number(formData.get('taxPercent'));

  const serviceCharges =
    serviceDescription && Number.isFinite(serviceFeeRupees) && serviceFeeRupees > 0
      ? [{ description: serviceDescription, unitPriceCents: Math.round(serviceFeeRupees * 100) }]
      : [];

  const bill = await withHospitalContext(hospitalId, (tx) =>
    createBill(tx, {
      hospitalId,
      actorId,
      visitId,
      serviceCharges,
      discountCents: Number.isFinite(discountRupees) ? Math.round(discountRupees * 100) : 0,
      taxPercent: Number.isFinite(taxPercent) ? taxPercent : undefined,
    }),
  );

  redirect(`/billing/${bill.id}`);
}
