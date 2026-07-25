import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// TEMPORARY local-disk stand-in for the real object storage the TRD calls
// for (S3-compatible, e.g. Cloudflare R2 -- Section 3 "File/Object Storage").
// Same shape (save bytes, get back a URL) so swapping in a real client later
// is a drop-in replacement of this one module, not a rewrite of callers.
//
// Files are served back by src/app/api/uploads/[...key]/route.ts, which has
// NO access control (see that file) -- acceptable for local dev only. Real
// object storage in production must use short-lived signed URLs or bucket
// policies scoped per hospital, not a public route like this.

const UPLOAD_ROOT = path.join(process.cwd(), '.data', 'uploads');

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

export interface SaveFileParams {
  hospitalId: string;
  visitId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}

export interface SavedFile {
  url: string;
  storageKey: string;
}

export async function saveFile(params: SaveFileParams): Promise<SavedFile> {
  const storageKey = `${params.hospitalId}/${params.visitId}/${randomUUID()}-${sanitizeFileName(params.fileName)}`;
  const filePath = path.join(UPLOAD_ROOT, storageKey);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, params.data);

  return { url: `/api/uploads/${storageKey}`, storageKey };
}

// Resolves a storage key (the path segment after /api/uploads/) back to
// bytes + content type. Rejects anything that would escape UPLOAD_ROOT.
export async function readStoredFile(
  storageKey: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const filePath = path.join(UPLOAD_ROOT, storageKey);
  if (!filePath.startsWith(UPLOAD_ROOT + path.sep)) {
    return null;
  }

  try {
    const data = await readFile(filePath);
    return { data, contentType: contentTypeFromExtension(filePath) };
  } catch {
    return null;
  }
}

// Content type isn't persisted alongside the file (Prescription.fileType in
// the DB is the source of truth for that) -- this is only a best-effort
// fallback for serving bytes back with a sane Content-Type header.
function contentTypeFromExtension(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
