import type { UserRole } from '@prisma/client';

import { prisma } from './prisma';
import { withHospitalContext } from './tenant-context';

// TEMPORARY placeholder for FR-2.4 authentication, which has not been built
// yet. Resolves "the current hospital and actor" by looking up the first
// hospital and its first active user of the given role (seeded by
// prisma/seed.mjs) instead of a real authenticated session. Every call site
// using this must be revisited once real auth exists -- do not build more
// features on top of it without flagging that.
async function getDevSessionForRole(
  role: UserRole,
): Promise<{ hospitalId: string; actorId: string }> {
  const hospital = await prisma.hospital.findFirstOrThrow({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const actor = await withHospitalContext(hospital.id, (tx) =>
    tx.user.findFirstOrThrow({
      where: { hospitalId: hospital.id, role, isActive: true },
      select: { id: true },
    }),
  );

  return { hospitalId: hospital.id, actorId: actor.id };
}

export function getDevFrontDeskSession(): Promise<{ hospitalId: string; actorId: string }> {
  return getDevSessionForRole('FRONT_DESK');
}

export function getDevDoctorSession(): Promise<{ hospitalId: string; actorId: string }> {
  return getDevSessionForRole('DOCTOR');
}

export function getDevPharmacistSession(): Promise<{ hospitalId: string; actorId: string }> {
  return getDevSessionForRole('PHARMACIST');
}
