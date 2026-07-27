import type { Prisma } from '@prisma/client';

import { getISTDateOnly } from '@/shared';

// FR-3.7/FR-3.8: auto-assigns a sequential front-desk queue/token number for
// a visit, reset daily (IST calendar day) and scoped per hospital only, not
// per doctor/department -- matches a single physical token dispenser at the
// front desk. Atomic upsert-increment via `INSERT ... ON CONFLICT ... DO
// UPDATE ... RETURNING` against DailyTokenCounter, since a daily-resetting
// counter needs a row per (hospital, day) -- unlike generatePatientCode/
// generateBillNumber, which increment a single column on the one Hospital
// row and never reset. Token date is derived from `now` (the actual
// creation instant), not the visit's possibly future/past scheduled
// visitDate -- matches FR-3.7's "at the time of front desk registration"
// wording. Display/reference number only: queue and next-patient ordering
// stay based on visitDate, not this.
export async function generateTokenNumber(
  tx: Prisma.TransactionClient,
  hospitalId: string,
  now: Date = new Date(),
): Promise<number> {
  const tokenDate = getISTDateOnly(now);

  const [row] = await tx.$queryRaw<{ last_token: number }[]>`
    INSERT INTO daily_token_counters (hospital_id, token_date, last_token)
    VALUES (${hospitalId}, ${tokenDate}, 1)
    ON CONFLICT (hospital_id, token_date)
    DO UPDATE SET last_token = daily_token_counters.last_token + 1
    RETURNING last_token
  `;

  if (!row) {
    throw new Error(`Failed to generate token number for hospital: ${hospitalId}`);
  }

  return row.last_token;
}
