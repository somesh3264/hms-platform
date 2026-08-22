'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { registerPatient } from '@/patients';
import { redirectWithFlash, requireSession, withHospitalContext } from '@/shared';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Age is entered directly, same validation as front-desk's own
// registration form (src/app/front-desk/actions.ts) -- deliberately not
// shared code, since duplicating this one small check isn't worth coupling
// two otherwise-independent Server Action modules together.
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

// Minimal registration for a counter-sale buyer -- name, age, phone only
// (no gender/email/address/consent fields), since a quick walk-in medicine
// purchase shouldn't need the full front-desk registration form. Still the
// same registerPatient function underneath (same patient-code sequence,
// same audit trail, same searchability later) -- only the form surface is
// smaller.
export async function registerCounterSaleBuyerAction(formData: FormData): Promise<void> {
  const { hospitalId, actorId } = await requireSession(['PHARMACIST']);

  let patientId: string | undefined;
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

    const patient = await withHospitalContext(hospitalId, (tx) =>
      registerPatient(tx, { hospitalId, actorId, name, age, phone }),
    );
    patientId = patient.id;
  } catch (err) {
    redirectWithFlash('/pharmacy/counter-sale', {
      error: err instanceof Error ? err.message : 'Failed to register patient.',
    });
  }

  // Without this, Next's Router Cache can keep serving the stale
  // pre-registration search results (0 matches) for these routes if
  // someone navigates back to them client-side within the cache's
  // staleTime -- a newly registered patient would look "not searchable"
  // even though the row exists. Front desk's own registration action
  // happens to dodge this because it always redirects back to a route it
  // came from (which gets a fresh render as part of that same redirect);
  // this one redirects to a different page, so it needs the explicit
  // invalidation front-desk's flow doesn't.
  revalidatePath('/pharmacy/counter-sale');
  revalidatePath('/front-desk');
  revalidatePath('/patients');

  redirect(`/pharmacy/counter-sale/${patientId}`);
}
