'use server';

import { timingSafeEqual } from 'node:crypto';

import { redirectWithFlash } from '@/shared';
import { onboardHospital } from '@/tenants';

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

// Constant-time compare, same shape as session.ts's signature check --
// avoids leaking how many leading characters of PLATFORM_ADMIN_SECRET a
// guess got right via response timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function onboardHospitalAction(formData: FormData): Promise<void> {
  // redirectWithFlash's success call must sit outside this try block --
  // Next's redirect() works by throwing, so calling it *inside* the try
  // would be caught by the catch below and reported as a failure instead of
  // actually redirecting (same pattern as every other action in this repo,
  // e.g. addMedicineStockAction).
  let successMessage: string;
  try {
    const expectedSecret = process.env.PLATFORM_ADMIN_SECRET;
    if (!expectedSecret) {
      throw new Error('PLATFORM_ADMIN_SECRET is not set -- see .env.example.');
    }

    const providedSecret = optionalString(formData, 'secret');
    if (!providedSecret || !secretMatches(providedSecret, expectedSecret)) {
      throw new Error('Incorrect platform admin secret.');
    }

    const hospitalName = optionalString(formData, 'hospitalName');
    const subdomain = optionalString(formData, 'subdomain');
    const adminName = optionalString(formData, 'adminName');
    const adminEmail = optionalString(formData, 'adminEmail');
    const adminPassword = optionalString(formData, 'adminPassword');
    if (!hospitalName || !subdomain || !adminName || !adminEmail || !adminPassword) {
      throw new Error('All fields are required.');
    }

    const { hospital } = await onboardHospital({
      hospitalName,
      subdomain,
      adminName,
      adminEmail,
      adminPassword,
    });

    const rootDomain = process.env.ROOT_DOMAIN ?? 'localhost';
    successMessage = `"${hospital.name}" is live at ${hospital.subdomain}.${rootDomain} -- its Hospital Admin can sign in there now.`;
  } catch (err) {
    redirectWithFlash('/onboarding', {
      error: err instanceof Error ? err.message : 'Failed to onboard hospital.',
    });
  }

  redirectWithFlash('/onboarding', { success: successMessage });
}
