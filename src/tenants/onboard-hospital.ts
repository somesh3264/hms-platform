import { hash } from 'bcryptjs';
import type { Hospital, User } from '@prisma/client';

import { prisma, recordAuditLog, withHospitalContext } from '@/shared';

export interface OnboardHospitalInput {
  hospitalName: string;
  subdomain: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface OnboardHospitalResult {
  hospital: Hospital;
  admin: User;
}

// DNS-label-safe: lowercase letters/digits/hyphens, no leading/trailing
// hyphen, <=63 chars.
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'onboarding']);

// FR-1.1/FR-1.6's missing write path: until now every Hospital row came
// from prisma/seed.mjs. Creates the hospital and its first Hospital Admin
// together so onboarding a new client is one step, not hand-written SQL --
// see src/app/onboarding for the (deliberately minimal, shared-secret-gated
// rather than a full platform-admin login) form that calls this.
export async function onboardHospital(input: OnboardHospitalInput): Promise<OnboardHospitalResult> {
  const hospitalName = input.hospitalName.trim();
  if (!hospitalName) {
    throw new Error('Hospital name is required.');
  }

  const subdomain = input.subdomain.trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(subdomain)) {
    throw new Error(
      'Subdomain must be lowercase letters, numbers, and hyphens only, and cannot start or end with a hyphen.',
    );
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    throw new Error(`"${subdomain}" is a reserved subdomain -- choose another.`);
  }

  const adminName = input.adminName.trim();
  if (!adminName) {
    throw new Error('Admin name is required.');
  }
  if (input.adminPassword.length < 8) {
    throw new Error('Admin password must be at least 8 characters.');
  }

  const subdomainTaken = await prisma.hospital.findUnique({ where: { subdomain } });
  if (subdomainTaken) {
    throw new Error(`Subdomain "${subdomain}" is already in use.`);
  }

  const hospital = await prisma.hospital.create({
    data: { name: hospitalName, subdomain, status: 'ACTIVE' },
  });

  const passwordHash = await hash(input.adminPassword, 10);

  const admin = await withHospitalContext(hospital.id, async (tx) => {
    const created = await tx.user.create({
      data: {
        hospitalId: hospital.id,
        name: adminName,
        email: input.adminEmail,
        passwordHash,
        role: 'HOSPITAL_ADMIN',
      },
    });

    // Self-referential actor: this account is the first thing that exists
    // in its own hospital, so it's necessarily its own audit actor -- same
    // shape as any "created by the deploy process" bootstrap record.
    await recordAuditLog(tx, {
      hospitalId: hospital.id,
      actorId: created.id,
      action: 'HOSPITAL_ONBOARDED',
      entityType: 'Hospital',
      entityId: hospital.id,
      metadata: { subdomain },
    });

    return created;
  });

  return { hospital, admin };
}
