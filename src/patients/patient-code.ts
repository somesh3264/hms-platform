import type { Prisma } from '@prisma/client';

// Auto-generates a unique per-hospital patient ID (FR-3.3), e.g. "P-000123".
// Uses an atomic UPDATE ... RETURNING on Hospital.patientCodeSeq so
// concurrent registrations at the same hospital never collide, rather than a
// read-then-increment race.
export async function generatePatientCode(
  tx: Prisma.TransactionClient,
  hospitalId: string,
): Promise<string> {
  const [row] = await tx.$queryRaw<{ patient_code_seq: number }[]>`
    UPDATE hospitals
    SET patient_code_seq = patient_code_seq + 1
    WHERE id = ${hospitalId}
    RETURNING patient_code_seq
  `;

  if (!row) {
    throw new Error(`Hospital not found: ${hospitalId}`);
  }

  return `P-${String(row.patient_code_seq).padStart(6, '0')}`;
}
