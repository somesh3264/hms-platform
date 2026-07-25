import type { Prisma } from '@prisma/client';

import { prisma } from './prisma';

// Runs `fn` inside a transaction with the Postgres session variable
// app.current_hospital_id set for its duration, which the Row-Level Security
// policies in prisma/migrations/*_add_row_level_security filter on. Every
// request handler that touches tenant-owned tables must go through this
// (using the `tx` it hands back, not the plain `prisma` client) or RLS will
// reject every read/write for that hospital.
//
// set_config(...) is used instead of a raw `SET LOCAL` string so hospitalId
// is passed as a bound parameter, not interpolated into SQL.
export async function withHospitalContext<T>(
  hospitalId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_hospital_id', ${hospitalId}, true)`;
    return fn(tx);
  });
}
