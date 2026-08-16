// One-time production bootstrap (go-live plan, Phase 01/03; Decision 3):
// creates the platform's very first Hospital + its first Hospital Admin
// from environment variables, so nobody has to hand-create it via psql or
// Prisma Studio, and no fixed credential ever needs to be committed to the
// repo the way a literal default admin/password would. Meant to be run
// once, right after `prisma migrate deploy` on a fresh database -- safe to
// include unconditionally in a deploy script, since it no-ops the moment
// any Hospital row already exists (idempotent, not "run every deploy and
// create duplicates").
//
// This only ever creates hospital #1. Every hospital after that goes
// through /onboarding (src/app/onboarding, PLATFORM_ADMIN_SECRET-gated) --
// see "Shared-platform tenant resolution" in CLAUDE.md. Deliberately a
// standalone script like seed.mjs, not a call into src/tenants'
// onboardHospital: that function runs through withHospitalContext against
// the RLS-restricted APP_DATABASE_URL role, but this script (like
// migrations and seed.mjs) runs as the elevated DATABASE_URL role, which
// bypasses RLS entirely -- the right privilege level for a script that
// only ever runs before any tenant context could exist.
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

const REQUIRED_ENV_VARS = [
  'BOOTSTRAP_HOSPITAL_NAME',
  'BOOTSTRAP_HOSPITAL_SUBDOMAIN',
  'BOOTSTRAP_ADMIN_NAME',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
];

// Same DNS-label-safe rule as src/tenants/onboard-hospital.ts's
// SUBDOMAIN_RE -- duplicated rather than imported, since this plain .mjs
// script (run directly via `node`, like seed.mjs) doesn't go through the
// TypeScript build that src/ relies on.
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

async function main() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Bootstrap skipped -- missing environment variable(s): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const existingCount = await prisma.hospital.count();
  if (existingCount > 0) {
    console.log(
      `Bootstrap skipped -- ${existingCount} hospital(s) already exist. This step only ever creates hospital #1; use /onboarding for any hospital after that.`,
    );
    return;
  }

  const subdomain = process.env.BOOTSTRAP_HOSPITAL_SUBDOMAIN.trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(subdomain)) {
    console.error(
      `Bootstrap failed -- BOOTSTRAP_HOSPITAL_SUBDOMAIN "${subdomain}" must be lowercase letters, numbers, and hyphens only, and cannot start or end with a hyphen.`,
    );
    process.exitCode = 1;
    return;
  }

  if (process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 8) {
    console.error('Bootstrap failed -- BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const hospital = await prisma.hospital.create({
    data: {
      name: process.env.BOOTSTRAP_HOSPITAL_NAME.trim(),
      subdomain,
      status: 'ACTIVE',
    },
  });

  const passwordHash = hashSync(process.env.BOOTSTRAP_ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: {
      hospitalId: hospital.id,
      name: process.env.BOOTSTRAP_ADMIN_NAME.trim(),
      email: process.env.BOOTSTRAP_ADMIN_EMAIL.trim(),
      passwordHash,
      role: 'HOSPITAL_ADMIN',
    },
  });

  console.log(`Bootstrapped "${hospital.name}" (${hospital.id}).`);
  console.log(
    `Log in at https://${hospital.subdomain}.<ROOT_DOMAIN>/login as ${process.env.BOOTSTRAP_ADMIN_EMAIL} with the password you set in BOOTSTRAP_ADMIN_PASSWORD.`,
  );
  console.log('From there, add real front-desk/doctor/pharmacist accounts via /admin/users.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
