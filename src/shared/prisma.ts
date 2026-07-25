import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient across hot reloads in development to avoid
// exhausting the Postgres connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// The running application connects as the restricted hms_app role (subject to
// Row-Level Security), not the superuser role migrations run as via
// DATABASE_URL -- see prisma/migrations/*_add_row_level_security. Falling
// back to DATABASE_URL keeps `npm run dev` working before APP_DATABASE_URL is
// configured, but means RLS is silently bypassed until it's set.
const datasourceUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ datasources: { db: { url: datasourceUrl } } });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
