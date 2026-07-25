import type { Prisma } from '@prisma/client';

// Prescription detail for the pharmacy dispensing screen (FR-6.2): the scan
// itself alongside patient/visit details, plus whatever's been dispensed
// against it so far.
export async function getPrescriptionDetail(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; prescriptionId: string },
) {
  const prescription = await tx.prescription.findFirst({
    where: { id: params.prescriptionId, hospitalId: params.hospitalId },
    include: {
      patient: true,
      visit: { select: { id: true, department: true, visitDate: true } },
      uploadedBy: { select: { id: true, name: true } },
      billLineItems: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!prescription) {
    throw new Error(`Prescription not found: ${params.prescriptionId}`);
  }

  return prescription;
}
