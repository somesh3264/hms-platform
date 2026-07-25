import { prisma } from './prisma';
import { withHospitalContext } from './tenant-context';

// TEMPORARY placeholder for FR-2.4 authentication, which has not been built
// yet. Resolves "the current hospital and front-desk actor" by looking up
// the first hospital and its first FRONT_DESK user (seeded by
// prisma/seed.mjs) instead of a real authenticated session. Every call site
// using this must be revisited once real auth exists -- do not build more
// features on top of it without flagging that.
export async function getDevFrontDeskSession(): Promise<{ hospitalId: string; actorId: string }> {
  const hospital = await prisma.hospital.findFirstOrThrow({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const actor = await withHospitalContext(hospital.id, (tx) =>
    tx.user.findFirstOrThrow({
      where: { hospitalId: hospital.id, role: 'FRONT_DESK', isActive: true },
      select: { id: true },
    }),
  );

  return { hospitalId: hospital.id, actorId: actor.id };
}
