'use server';

import type { Gender, PaymentMethod, Prisma } from '@prisma/client';

import { collectConsultationFee } from '@/billing';
import { registerPatient } from '@/patients';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';
import { createVisit } from '@/visits';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Combines the separate appointment date (<input type="date">) and time
// (<input type="time">) fields -- split from one datetime-local field since
// that combined picker made the time easy to miss -- back into the single
// instant Visit.visitDate needs. No timezone in either part -- interpreted
// as the server's local time, same as the previous single-field version.
function combineDateAndTime(
  dateStr: string | undefined,
  timeStr: string | undefined,
): Date | undefined {
  if (!dateStr && !timeStr) return undefined;
  if (!dateStr || !timeStr) {
    throw new Error('Both an appointment date and time are required if either is set.');
  }
  const parsed = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid appointment date/time.');
  }
  return parsed;
}

// Age is a plain whole number entered directly (a later, explicitly
// requested simplification replacing the old day/month/year date-of-birth
// selects) -- validated here rather than trusting the form's own
// min/max/pattern attributes, since those are only a UX hint, not enforced
// server-side.
function parseAge(raw: string | undefined): number {
  if (!raw) {
    throw new Error('Age is required.');
  }
  const age = Number(raw);
  if (!Number.isInteger(age) || age < 0 || age > 150) {
    throw new Error('Age must be a whole number between 0 and 150.');
  }
  return age;
}

// Collects the consultation fee at the front desk (BRS-adjacent addition,
// no FR number) -- immediately if front desk actually typed a fee amount
// (a walk-in, or a booked patient paying up front over the phone), or
// deferred if the fee field was left blank, in which case front desk
// collects it later via collectConsultationFeeAction once the patient
// arrives (see the waiting-queue form in page.tsx). Deliberately keyed off
// whether the fee field was filled in, not the appointment date/time --
// an earlier date-based version silently discarded a fee front desk had
// typed in whenever the appointment time happened to read as "in the
// future" (e.g. a booked slot later that same day), with no error and no
// visible sign the money wasn't collected. This way the decision is fully
// in front desk's hands: type an amount and it's charged now, leave it
// blank and it's deferred -- no guessing from the clock. Referral discount
// is entered in rupees, same convention as the billing module's discount
// field.
async function maybeCollectConsultationFee(
  tx: Prisma.TransactionClient,
  params: {
    hospitalId: string;
    actorId: string;
    visitId: string;
    formData: FormData;
  },
): Promise<boolean> {
  const feeProvided = optionalString(params.formData, 'consultationFeeRupees');
  if (!feeProvided) {
    return false;
  }

  const feeRupees = Number(feeProvided);
  if (!Number.isFinite(feeRupees) || feeRupees <= 0) {
    throw new Error('Consultation fee must be a valid amount greater than zero.');
  }
  const discountRupees = Number(params.formData.get('discountRupees') ?? 0);
  const paymentMethod = optionalString(params.formData, 'paymentMethod');
  if (!paymentMethod) {
    throw new Error('A payment method is required to collect the consultation fee.');
  }

  await collectConsultationFee(tx, {
    hospitalId: params.hospitalId,
    actorId: params.actorId,
    visitId: params.visitId,
    feeCents: Math.round(feeRupees * 100),
    discountCents: Number.isFinite(discountRupees) ? Math.round(discountRupees * 100) : 0,
    paymentMethod: paymentMethod as PaymentMethod,
  });
  return true;
}

export async function registerPatientAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

  let feeCollected = false;
  try {
    const name = optionalString(formData, 'name');
    if (!name) {
      throw new Error('Name is required.');
    }
    const age = parseAge(optionalString(formData, 'age'));
    const phone = optionalString(formData, 'phone');
    if (!phone) {
      throw new Error('Phone number is required.');
    }

    // Assigning a doctor is optional here -- if chosen, a visit/appointment is
    // created for the new patient in the same step (FR-3.2 + FR-3.4 combined,
    // matching the common front-desk workflow of a walk-in registering and
    // immediately being queued); left blank, this just registers the patient
    // as before, and a visit can still be created later via the search results
    // above (createVisitAction).
    const doctorId = optionalString(formData, 'doctorId');
    const visitDate = combineDateAndTime(
      optionalString(formData, 'visitDateOnly'),
      optionalString(formData, 'visitTimeOnly'),
    );

    feeCollected = await withHospitalContext(hospitalId, async (tx) => {
      const patient = await registerPatient(tx, {
        hospitalId,
        actorId,
        name,
        age,
        gender: optionalString(formData, 'gender') as Gender | undefined,
        phone,
        email: optionalString(formData, 'email'),
        address: optionalString(formData, 'address'),
        consentDigitalDelivery: formData.get('consentDigitalDelivery') === 'on',
      });

      if (!doctorId) {
        return false;
      }
      const visit = await createVisit(tx, {
        hospitalId,
        actorId,
        patientId: patient.id,
        doctorId,
        visitDate,
      });
      return maybeCollectConsultationFee(tx, {
        hospitalId,
        actorId,
        visitId: visit.id,
        formData,
      });
    });
  } catch (err) {
    redirectWithFlash('/front-desk', {
      error: err instanceof Error ? err.message : 'Failed to register patient.',
    });
  }

  redirectWithFlash('/front-desk', {
    success: feeCollected
      ? 'Patient registered and consultation fee collected.'
      : 'Patient registered successfully.',
  });
}

export async function createVisitAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);
  const query = optionalString(formData, 'q');
  const path = query ? `/front-desk?q=${encodeURIComponent(query)}` : '/front-desk';

  let feeCollected = false;
  try {
    const patientId = optionalString(formData, 'patientId');
    const doctorId = optionalString(formData, 'doctorId');
    if (!patientId || !doctorId) {
      throw new Error('A patient and doctor are required to create a visit.');
    }
    const visitDate = combineDateAndTime(
      optionalString(formData, 'visitDateOnly'),
      optionalString(formData, 'visitTimeOnly'),
    );

    feeCollected = await withHospitalContext(hospitalId, async (tx) => {
      const visit = await createVisit(tx, {
        hospitalId,
        actorId,
        patientId,
        doctorId,
        department: optionalString(formData, 'department'),
        visitDate,
      });
      return maybeCollectConsultationFee(tx, {
        hospitalId,
        actorId,
        visitId: visit.id,
        formData,
      });
    });
  } catch (err) {
    redirectWithFlash(path, {
      error: err instanceof Error ? err.message : 'Failed to create visit.',
    });
  }

  redirectWithFlash(path, {
    success: feeCollected
      ? 'Visit created and consultation fee collected.'
      : 'Visit created successfully.',
  });
}

// For a visit that was booked ahead of time (fee deferred at creation, see
// maybeCollectConsultationFee above) -- front desk calls this once the
// patient physically arrives, from the inline form on their waiting-queue
// row (page.tsx). Not reused for the walk-in path above since this one
// always requires the fee/payment fields outright, no date-based deferral.
export async function collectConsultationFeeAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

  try {
    const visitId = optionalString(formData, 'visitId');
    if (!visitId) {
      throw new Error('Missing visit.');
    }
    const feeRupees = Number(formData.get('consultationFeeRupees'));
    if (!Number.isFinite(feeRupees) || feeRupees <= 0) {
      throw new Error('A consultation fee amount is required.');
    }
    const discountRupees = Number(formData.get('discountRupees') ?? 0);
    const paymentMethod = optionalString(formData, 'paymentMethod');
    if (!paymentMethod) {
      throw new Error('A payment method is required.');
    }

    await withHospitalContext(hospitalId, (tx) =>
      collectConsultationFee(tx, {
        hospitalId,
        actorId,
        visitId,
        feeCents: Math.round(feeRupees * 100),
        discountCents: Number.isFinite(discountRupees) ? Math.round(discountRupees * 100) : 0,
        paymentMethod: paymentMethod as PaymentMethod,
      }),
    );
  } catch (err) {
    redirectWithFlash('/front-desk', {
      error: err instanceof Error ? err.message : 'Failed to collect consultation fee.',
    });
  }

  redirectWithFlash('/front-desk', { success: 'Consultation fee collected.' });
}
