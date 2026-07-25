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
// see listPharmacyQueue. Only valid while the visit is IN_CONSULTATION,
// matching the BRS flow (doctor writes the prescription during consultation,
// uploads it, then completes the consultation -- see
// src/visits/consultation.ts's completeConsultation, which requires this to
// have happened first).
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
    where: { id: input.visitId, hospitalId: input.hospitalId, status: 'IN_CONSULTATION' },
    select: { id: true, patientId: true },
  });
  if (!visit) {
    throw new Error(`Visit not found or not in consultation: ${input.visitId}`);
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
