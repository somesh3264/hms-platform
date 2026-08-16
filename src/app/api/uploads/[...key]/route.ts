import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/shared';
import { readStoredFile } from '@/shared/storage';

// Public branding assets -- not patient data. logoUrl is shown on /login
// itself, before anyone has a session, so these two must stay reachable
// without one; every other key (prescription scans, keyed by
// {hospitalId}/{visitId}/...) is sensitive and gets the session gate below.
const PUBLIC_KEY_SEGMENTS = new Set(['logo', 'upi-qr']);

// Interim access control for src/shared/storage.ts's local-disk stand-in
// for real object storage (go-live plan, Phase 01, item one) -- not the
// final fix. Every storage key's first path segment is the owning
// hospitalId (see saveFile/saveHospitalLogo/saveHospitalUpiQrCode in
// storage.ts), so a logged-in session's hospitalId must match it. This
// closes "anyone on the internet who guesses or intercepts a URL" but is
// still weaker than the planned migration: a valid session can fetch any
// file at its own hospital indefinitely, with no expiry, and local disk
// still has no redundancy of its own -- pair with a persistent volume in
// production. Delete this whole route (not harden it further) once real
// object storage (S3/R2) with short-lived signed URLs is in place.
export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } },
): Promise<NextResponse> {
  const [ownerHospitalId, category] = params.key;
  const isPublicAsset = category !== undefined && PUBLIC_KEY_SEGMENTS.has(category);

  if (!isPublicAsset) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (ownerHospitalId !== session.hospitalId) {
      // Same response as a genuinely missing file -- don't reveal to a
      // session at one hospital whether a key exists at another.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const storageKey = params.key.join('/');
  const file = await readStoredFile(storageKey);

  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: { 'Content-Type': file.contentType },
  });
}
