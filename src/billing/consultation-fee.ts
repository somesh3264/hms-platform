import type { Bill, PaymentMethod, Prisma } from '@prisma/client';

import { collectFrontDeskCharges } from './front-desk-charges';

// Exported so src/reporting's revenue bifurcation (consultation fee vs
// other charges) can match on this exact string instead of a second,
// potentially-drifting copy of it.
export const CONSULTATION_FEE_DESCRIPTION = 'Consultation fee';

export interface CollectConsultationFeeInput {
  hospitalId: string;
  actorId: string;
  visitId: string;
  feeCents: number;
  discountCents?: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
}

// Front desk collects the consultation fee itself -- immediately for a
// walk-in, or later when a booked appointment's patient arrives (see
// src/app/front-desk/actions.ts). A thin single-charge wrapper around the
// more general collectFrontDeskCharges (src/billing/front-desk-charges.ts,
// added when front desk also gained the ability to bill for surgery/other
// procedures) -- kept as its own named function since the walk-in/booked
// deferral logic in maybeCollectConsultationFee only ever deals with this
// one fee, not an arbitrary charge list.
export async function collectConsultationFee(
  tx: Prisma.TransactionClient,
  input: CollectConsultationFeeInput,
): Promise<Bill> {
  return collectFrontDeskCharges(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    visitId: input.visitId,
    charges: [{ description: CONSULTATION_FEE_DESCRIPTION, amountCents: input.feeCents }],
    discountCents: input.discountCents,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    auditAction: 'CONSULTATION_FEE_COLLECTED',
  });
}
