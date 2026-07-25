import type { Prescription, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';
import { saveFile } from '@/shared/storage';

import { ALLOWED_PRESCRIPTION_MIME_TYPES, MAX_PRESCRIPTION_FILE_SIZE_BYTES } from './constants';

export interface ReplacePrescriptionInput {
  hospitalId: string;
  actorId: string;
  prescriptionId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
  notes?: string;
}

// Re-upload/replacement of a prescription scan the doctor identifies as
// wrong (FR-5.6). Marks the old row SUPERSEDED rather than overwriting or
// deleting it -- the original stays on the patient's permanent record
// (FR-5.5) and the audit trail records the change, rather than silently
// erasing it. Only valid while the existing prescription is still UPLOADED
// (not yet DISPENSED -- once pharmacy has acted on it, replacing it here
// would contradict what was actually dispensed) and not already SUPERSEDED.
export async function replacePrescription(
  tx: Prisma.TransactionClient,
  input: ReplacePrescriptionInput,
): Promise<Prescription> {
  if (!ALLOWED_PRESCRIPTION_MIME_TYPES.includes(input.contentType as never)) {
    throw new Error(
      `Unsupported file type: ${input.contentType}. Allowed: ${ALLOWED_PRESCRIPTION_MIME_TYPES.join(', ')}`,
    );
  }
  if (input.data.byteLength === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (input.data.byteLength > MAX_PRESCRIPTION_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large: ${input.data.byteLength} bytes (max ${MAX_PRESCRIPTION_FILE_SIZE_BYTES}).`,
    );
  }

  const existing = await tx.prescription.findFirst({
    where: { id: input.prescriptionId, hospitalId: input.hospitalId, status: 'UPLOADED' },
    select: { id: true, visitId: true, patientId: true },
  });
  if (!existing) {
    throw new Error(`Prescription not found or not replaceable: ${input.prescriptionId}`);
  }

  const { url } = await saveFile({
    hospitalId: input.hospitalId,
    visitId: existing.visitId,
    fileName: input.fileName,
    contentType: input.contentType,
    data: input.data,
  });

  const replacement = await tx.prescription.create({
    data: {
      hospitalId: input.hospitalId,
      visitId: existing.visitId,
      patientId: existing.patientId,
      uploadedById: input.actorId,
      fileUrl: url,
      fileType: input.contentType,
      notes: input.notes,
    },
  });

  await tx.prescription.update({
    where: { id: existing.id },
    data: { status: 'SUPERSEDED' },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'PRESCRIPTION_REPLACED',
    entityType: 'Prescription',
    entityId: replacement.id,
    metadata: { supersededPrescriptionId: existing.id, visitId: existing.visitId },
  });

  return replacement;
}
