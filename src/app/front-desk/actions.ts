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

// Combines the three <select>s from DateOfBirthFields (src/app/front-desk/page.tsx)
// into a Date, the same "YYYY-MM-DD" -> new Date(...) construction the
// single <input type="date"> used before (parsed as UTC midnight) -- but
// now with real-calendar-date validation, since three independent selects
// can produce a combination (e.g. 30 February) a native date picker would
// never have let through.
function parseDateOfBirth(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
): Date {
  if (!year || !month || !day) {
    throw new Error('Date of birth is required.');
  }
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(iso);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new Error('Invalid date of birth.');
  }
  return parsed;
}

// Collects the consultation fee at the front desk (BRS-adjacent addition,
// no FR number) -- immediately if the visit being created is "now" (a
// walk-in), or deferred if it's a future-dated appointment, in which case
// front desk collects it later via collectConsultationFeeAction once the
// patient actually arrives (see the waiting-queue form in page.tsx). A
// visit with no explicit date defaults to now in createVisit, so undefined
// counts as a walk-in here too. Referral discount is entered in rupees,
// same convention as the billing module's discount field.
async function maybeCollectConsultationFee(
  tx: Prisma.TransactionClient,
  params: {
    hospitalId: string;
    actorId: string;
    visitId: string;
    visitDate: Date | undefined;
    formData: FormData;
  },
): Promise<boolean> {
  const isWalkIn = !params.visitDate || params.visitDate.getTime() <= Date.now();
  if (!isWalkIn) {
    return false;
  }

  const feeRupees = Number(params.formData.get('consultationFeeRupees'));
  if (!Number.isFinite(feeRupees) || feeRupees <= 0) {
    throw new Error('A consultation fee amount is required to register a walk-in visit.');
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
    const firstName = optionalString(formData, 'firstName');
    const lastName = optionalString(formData, 'lastName');
    if (!firstName || !lastName) {
      throw new Error('First name, last name, and date of birth are required.');
    }
    const dateOfBirth = parseDateOfBirth(
      optionalString(formData, 'dobYear'),
      optionalString(formData, 'dobMonth'),
      optionalString(formData, 'dobDay'),
    );

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
        firstName,
        lastName,
        dateOfBirth,
        gender: optionalString(formData, 'gender') as Gender | undefined,
        phone: optionalString(formData, 'phone'),
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
        visitDate,
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
        visitDate,
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
