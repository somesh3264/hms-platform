import { NextRequest, NextResponse } from 'next/server';

import { createSession, ROLE_HOME, withHospitalContext } from '@/shared';
import { resolveCurrentHospitalId } from '@/tenants';
import { authenticateUser } from '@/users';

// A real Route Handler, not a Server Action -- same fix as /logout/route.ts
// and the same root cause. A Server Action's redirect() is a client-side
// (soft) navigation through Next's Router Cache: a failed login redirected
// back to /login via loginAction's redirect(), and that soft navigation
// could reuse a stale cached render of /login -- including a stale
// "Hospital not found" render from some earlier request -- instead of
// resolving the hospital fresh. A manual refresh of the exact same URL
// always fixed it (a fresh server request bypasses the Router Cache
// entirely), the same tell that pointed the logout bug at caching rather
// than bad data. Posting to a separate real Route Handler and issuing a
// genuine HTTP redirect makes every outcome (bad input, unknown hospital,
// bad credentials, success) a full page navigation, sidestepping the
// Router Cache altogether. Lives at /login/submit rather than /login
// itself since a route segment can't have both a page.tsx (GET) and a
// route.ts (POST) at the same path.
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read the Host header directly rather than trusting request.url -- the
  // same unreliability found and fixed in /logout/route.ts, where
  // NextRequest.url resolved to the server's own canonical address and
  // silently dropped the subdomain.
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') ?? 'http';
  const origin = `${protocol}://${host}`;

  const formData = await request.formData();
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 303 });
  }

  const hospitalId = await resolveCurrentHospitalId();
  if (!hospitalId) {
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 303 });
  }

  const user = await withHospitalContext(hospitalId, (tx) =>
    authenticateUser(tx, { hospitalId, email, password }),
  );

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=1`, { status: 303 });
  }

  await createSession({
    id: user.id,
    hospitalId,
    role: user.role,
    name: user.name,
    department: user.department ?? undefined,
  });

  return NextResponse.redirect(`${origin}${ROLE_HOME[user.role]}`, { status: 303 });
}
