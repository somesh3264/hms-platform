'use server';

import type { Gender } from '@prisma/client';

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

export async function registerPatientAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);

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

    await withHospitalContext(hospitalId, async (tx) => {
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

      if (doctorId) {
        await createVisit(tx, { hospitalId, actorId, patientId: patient.id, doctorId, visitDate });
      }
    });
  } catch (err) {
    redirectWithFlash('/front-desk', {
      error: err instanceof Error ? err.message : 'Failed to register patient.',
    });
  }

  redirectWithFlash('/front-desk', { success: 'Patient registered successfully.' });
}

export async function createVisitAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['FRONT_DESK']);
  const query = optionalString(formData, 'q');
  const path = query ? `/front-desk?q=${encodeURIComponent(query)}` : '/front-desk';

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

    await withHospitalContext(hospitalId, (tx) =>
      createVisit(tx, {
        hospitalId,
        actorId,
        patientId,
        doctorId,
        department: optionalString(formData, 'department'),
        visitDate,
      }),
    );
  } catch (err) {
    redirectWithFlash(path, { error: err instanceof Error ? err.message : 'Failed to create visit.' });
  }

  redirectWithFlash(path, { success: 'Visit created successfully.' });
}
