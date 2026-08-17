import type { Prisma } from '@prisma/client';

// Visit detail view for the doctor's consultation screen (FR-4.1): the
// visit itself plus the patient, assigned doctor, and any prescriptions
// already attached to it.
export async function getVisitDetail(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; visitId: string },
) {
  const visit = await tx.visit.findFirst({
    where: { id: params.visitId, hospitalId: params.hospitalId },
    include: {
      // Lets the visit detail screen flag a returning patient (visits count
      // includes this very visit, so >1 means there's at least one other)
      // without a separate query.
      patient: { include: { _count: { select: { visits: true } } } },
      doctor: { select: { id: true, name: true } },
      prescriptions: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!visit) {
    throw new Error(`Visit not found: ${params.visitId}`);
  }

  return visit;
}
