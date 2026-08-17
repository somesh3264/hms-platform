import { NextRequest, NextResponse } from 'next/server';

import { destroySession } from '@/shared';

// A real Route Handler (plain HTTP redirect) rather than a Server Action.
// A Server Action's redirect() does a client-side (soft) navigation through
// Next's router cache -- which was serving a stale cached render of /login
// right after logout (a manual refresh of the same URL always worked,
// since that forces a fresh server request, bypassing the router cache
// entirely). A genuine <form method="post"> POST to this Route Handler,
// followed by a real HTTP redirect, makes the browser itself perform a
// full page navigation, sidestepping that cache altogether.
export async function POST(request: NextRequest): Promise<NextResponse> {
  await destroySession();
  // request.url does NOT reliably reflect the incoming Host header here --
  // it resolves to the server's own canonical address instead, which would
  // silently drop the subdomain (e.g. redirecting shivgeet.medivibe.in to
  // plain medivibe.in). Read the Host header directly instead, the same way
  // extractSubdomain (src/tenants/resolve-hospital.ts) already does, so
  // this always lands back on whichever hospital's subdomain the request
  // actually came in on. x-forwarded-proto is set by Caddy's reverse_proxy
  // in production; falls back to http for local dev, which has no proxy.
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') ?? 'http';
  return NextResponse.redirect(`${protocol}://${host}/login`, { status: 303 });
}
