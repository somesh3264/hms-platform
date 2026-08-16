import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/shared';
import { extractSubdomain } from '@/tenants';

// Caddy's on-demand TLS "ask" endpoint (see Caddyfile's `ask` directive):
// before requesting a real certificate for a hostname it's never seen
// before, Caddy calls this with ?domain=<hostname> and only proceeds on a
// 200 response. Without this gate, a wildcard DNS record
// (*.ROOT_DOMAIN -> this server) means literally any subdomain anyone
// types resolves here and would trigger a real Let's Encrypt request --
// wasteful at best, and a way to burn through Let's Encrypt's per-domain
// rate limit at worst (an attacker spamming random subdomains).
//
// Approves the bare root domain (a legitimate page even for a mistyped or
// unknown subdomain -- see src/app/login's own "Hospital not found"
// handling, which still needs to be served over real HTTPS) and any
// subdomain that matches a real, active hospital -- reusing
// extractSubdomain so this can never approve a hostname login would then
// reject, or vice versa.
//
// Not meant to be reachable from the public internet in practice (Caddy
// calls it over the compose network at http://app:3000/...), but doesn't
// leak anything beyond what an unauthenticated GET to /login already does
// for the same hostname.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const hostname = request.nextUrl.searchParams.get('domain')?.toLowerCase();
  if (!hostname) {
    return new NextResponse(null, { status: 400 });
  }

  const rootDomain = process.env.ROOT_DOMAIN ?? 'localhost';
  if (hostname === rootDomain || hostname === `www.${rootDomain}`) {
    return new NextResponse(null, { status: 200 });
  }

  const subdomain = extractSubdomain(hostname);
  if (!subdomain) {
    return new NextResponse(null, { status: 403 });
  }

  const hospital = await prisma.hospital.findFirst({
    where: { subdomain, status: 'ACTIVE' },
    select: { id: true },
  });

  return new NextResponse(null, { status: hospital ? 200 : 403 });
}
