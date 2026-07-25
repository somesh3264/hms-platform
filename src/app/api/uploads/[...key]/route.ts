import { NextRequest, NextResponse } from 'next/server';

import { readStoredFile } from '@/shared/storage';

// TEMPORARY dev-only file server for src/shared/storage.ts's local-disk
// stand-in for real object storage. Deliberately has NO access control --
// anyone who knows or guesses a storage key can read the file, which is not
// acceptable once this represents real patient prescription scans. Real
// object storage (S3/R2) must be fronted by short-lived signed URLs or
// bucket policies scoped per hospital; this route should be deleted (not
// hardened) once that's in place.
export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } },
): Promise<NextResponse> {
  const storageKey = params.key.join('/');
  const file = await readStoredFile(storageKey);

  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: { 'Content-Type': file.contentType },
  });
}
