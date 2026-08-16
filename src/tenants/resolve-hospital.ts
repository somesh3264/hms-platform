import { headers } from 'next/headers';
import type { Hospital } from '@prisma/client';

import { prisma } from '@/shared';

// Shared-platform tenant resolution (BRS FR-1.7): one deployment, one root
// domain, every hospital gets a free subdomain (Hospital.subdomain). Set
// ROOT_DOMAIN in production to the real domain (e.g. "hms-platform.in").
// Defaults to "localhost" so "<subdomain>.localhost:3000" resolves a real
// hospital locally with zero /etc/hosts editing -- most browsers already
// treat any *.localhost host as 127.0.0.1.
const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? 'localhost';

// Exported so src/app/api/internal/tls-ask (Caddy's on-demand-TLS gate)
// reuses this exact rule rather than a second, potentially-diverging copy
// of it -- that endpoint deciding "issue a real certificate for this
// hostname" must never disagree with login deciding "this hostname is a
// real hospital."
export function extractSubdomain(hostHeader: string | null): string | null {
  if (!hostHeader) {
    return null;
  }
  const hostname = (hostHeader.split(':')[0] ?? '').toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) {
    return null;
  }
  const suffix = `.${ROOT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }
  return hostname.slice(0, -suffix.length) || null;
}

// Returns null (not a throw) on an unresolvable address -- a mistyped or
// stale subdomain is an expected, user-facing case (BRS FR-1.7's "unknown
// hospital" path), not an application error. Callers (src/app/login) render
// their own "hospital not found" message rather than Next's generic error
// page.
export async function resolveCurrentHospital(): Promise<Hospital | null> {
  const hostHeader = (await headers()).get('host');
  const subdomain = extractSubdomain(hostHeader);

  if (subdomain) {
    return prisma.hospital.findFirst({ where: { subdomain, status: 'ACTIVE' } });
  }

  // DEV-ONLY convenience, never reachable in production: hitting the bare
  // root host (plain "localhost:3000", no subdomain) falls back to the
  // oldest active hospital so `npm run dev` keeps working without typing
  // "<subdomain>.localhost:3000" every time. In production a bare-domain
  // hit with no matching subdomain is a real "which hospital?" failure and
  // must not be guessed at -- that silent-guess behavior is exactly the bug
  // this migration replaces.
  if (process.env.NODE_ENV !== 'production') {
    return prisma.hospital.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  return null;
}

export async function resolveCurrentHospitalId(): Promise<string | null> {
  const hospital = await resolveCurrentHospital();
  return hospital?.id ?? null;
}
