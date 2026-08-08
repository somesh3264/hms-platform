import type { Patient, Prisma } from '@prisma/client';

// Search by name, phone, or patient ID (FR-3.1, FR-8.3) so front desk staff
// can find an existing patient before registering a possible duplicate.
export async function searchPatients(
  tx: Prisma.TransactionClient,
  params: { hospitalId: string; query: string; limit?: number },
): Promise<Patient[]> {
  const query = params.query.trim();
  if (!query) return [];

  return tx.patient.findMany({
    where: {
      hospitalId: params.hospitalId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { patientCode: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 20,
  });
}
