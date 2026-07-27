import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { UserRole } from '@prisma/client';

// Signed-cookie session (TRD Section 3: "self-hosted session/JWT-based auth
// ... and role middleware"). No server-side session store -- the cookie
// itself, HMAC-signed with SESSION_SECRET, is the source of truth between
// logins, the same tradeoff a stateless JWT would make. Replaces
// src/shared/dev-session.ts now that real login (src/app/login) exists.

const SESSION_COOKIE_NAME = 'hms_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // FR-2.4 / TRD 5.1: session expiry

interface SessionPayload {
  sub: string; // User.id
  hospitalId: string;
  role: UserRole;
  name: string;
  exp: number; // epoch seconds
}

export interface Session {
  hospitalId: string;
  actorId: string;
  role: UserRole;
  name: string;
}

// Where each role lands after login / on `/`. SUPER_ADMIN has no screen yet
// (Super Admin tenant management is out of scope for this pass), so it
// bounces back to /login rather than looping through requireSession.
export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: '/login',
  HOSPITAL_ADMIN: '/admin/hospital',
  FRONT_DESK: '/front-desk',
  DOCTOR: '/doctor',
  PHARMACIST: '/pharmacy',
  BILLING_STAFF: '/billing',
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not set -- see .env.example.');
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

function encode(payload: SessionPayload): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decode(token: string): SessionPayload | null {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return null;
  }

  const expected = sign(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (
      typeof payload?.sub !== 'string' ||
      typeof payload?.hospitalId !== 'string' ||
      typeof payload?.role !== 'string' ||
      typeof payload?.name !== 'string' ||
      typeof payload?.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < Date.now() / 1000) {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(user: {
  id: string;
  hospitalId: string;
  role: UserRole;
  name: string;
}): Promise<void> {
  const payload: SessionPayload = {
    sub: user.id,
    hospitalId: user.hospitalId,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  (await cookies()).set(SESSION_COOKIE_NAME, encode(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = decode(token);
  if (!payload) {
    return null;
  }

  return {
    hospitalId: payload.hospitalId,
    actorId: payload.sub,
    role: payload.role,
    name: payload.name,
  };
}

// Drop-in replacement for the getDevXSession() stubs: redirects to /login if
// there's no session, and back to / (which itself routes by role) if the
// session's role isn't one of allowedRoles. Omit allowedRoles to just
// require "some authenticated user" (e.g. the patient longitudinal view,
// FR-8, open to any authorized staff role).
export async function requireSession(allowedRoles?: UserRole[]): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    redirect('/');
  }
  return session;
}
