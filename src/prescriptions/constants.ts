// FR-5.3: "common image/PDF formats" and "a reasonable maximum file size".
// The BRS doesn't pin exact values, so these are an indicative default --
// adjust freely, this isn't load-bearing elsewhere.
export const ALLOWED_PRESCRIPTION_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_PRESCRIPTION_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
