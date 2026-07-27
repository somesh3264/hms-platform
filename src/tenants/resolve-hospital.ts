import { prisma } from '@/shared';

// TEMPORARY, single-tenant-deployment assumption: today this codebase runs
// against exactly one hospital, and "personalization per hospital" means
// swapping that hospital's logo/branding, not a shared login across many
// hospitals -- so login resolves the tenant automatically instead of asking
// the user to pick one (see src/app/login). This picks an arbitrary
// `ACTIVE` hospital (oldest first) once a second one is onboarded, which
// would silently be wrong -- revisit with a real tenant-resolution
// mechanism (e.g. per-hospital subdomain) before onboarding a second client.
export async function resolveCurrentHospitalId(): Promise<string> {
  const hospital = await prisma.hospital.findFirstOrThrow({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return hospital.id;
}
