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
      patient: true,
      doctor: { select: { id: true, name: true } },
      prescriptions: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!visit) {
    throw new Error(`Visit not found: ${params.visitId}`);
  }

  return visit;
}
