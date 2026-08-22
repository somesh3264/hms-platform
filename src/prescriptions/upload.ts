import type { Prescription, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';
import { saveFile } from '@/shared/storage';

import { ALLOWED_PRESCRIPTION_MIME_TYPES, MAX_PRESCRIPTION_FILE_SIZE_BYTES } from './constants';

export interface UploadPrescriptionInput {
  hospitalId: string;
  actorId: string;
  visitId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
  notes?: string;
}

// Scans/uploads a prescription against a visit (FR-5.1/5.2), auto-routing it
// to the pharmacy queue (FR-5.4) simply by existing with status UPLOADED --
// see listPharmacyQueue. Valid while the visit is IN_CONSULTATION *or*
// already COMPLETED -- a later, explicitly requested change: completing a
// consultation no longer waits on a prescription existing first (see
// completeConsultation), since the real workflow has the doctor moving on
// to the next patient while front desk is still scanning the paper
// prescription in on a separate phone call, so the visit is often already
// COMPLETED by the time the scan is actually attached. Still rejects a
// WAITING or CANCELLED visit -- there's no consultation to attach a
// prescription to yet/anymore in those states.
export async function uploadPrescription(
  tx: Prisma.TransactionClient,
  input: UploadPrescriptionInput,
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

  const visit = await tx.visit.findFirst({
    where: {
      id: input.visitId,
      hospitalId: input.hospitalId,
      status: { in: ['IN_CONSULTATION', 'COMPLETED'] },
    },
    select: { id: true, patientId: true },
  });
  if (!visit) {
    throw new Error(`Visit not found, or not in consultation/completed: ${input.visitId}`);
  }

  const { url } = await saveFile({
    hospitalId: input.hospitalId,
    visitId: input.visitId,
    fileName: input.fileName,
    contentType: input.contentType,
    data: input.data,
  });

  const prescription = await tx.prescription.create({
    data: {
      hospitalId: input.hospitalId,
      visitId: visit.id,
      patientId: visit.patientId,
      uploadedById: input.actorId,
      fileUrl: url,
      fileType: input.contentType,
      notes: input.notes,
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'PRESCRIPTION_UPLOADED',
    entityType: 'Prescription',
    entityId: prescription.id,
    metadata: { visitId: visit.id, fileType: input.contentType },
  });

  return prescription;
}
