import type { Prisma } from '@prisma/client';

// Auto-generates a unique per-hospital bill number (FR-7.1/FR-7.7), e.g.
// "INV-000123". Same atomic UPDATE ... RETURNING pattern as
// src/patients/patient-code.ts's generatePatientCode, for the same reason:
// concurrent bill generation at the same hospital must not collide.
export async function generateBillNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string,
): Promise<string> {
  const [row] = await tx.$queryRaw<{ bill_number_seq: number }[]>`
    UPDATE hospitals
    SET bill_number_seq = bill_number_seq + 1
    WHERE id = ${hospitalId}
    RETURNING bill_number_seq
  `;

  if (!row) {
    throw new Error(`Hospital not found: ${hospitalId}`);
  }

  return `INV-${String(row.bill_number_seq).padStart(6, '0')}`;
}
