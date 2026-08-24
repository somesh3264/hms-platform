import type { Prisma, Visit } from '@prisma/client';

import { recordAuditLog } from '@/shared';

import { generateTokenNumber } from './token-number';

export interface CreateVisitInput {
  hospitalId: string;
  actorId: string;
  patientId: string;
  doctorId: string;
  department?: string;
  visitDate?: Date;
}

// Front desk's "Assign doctor" dropdown carries this instead of a real
// doctorId when the "Shivgeet hospital" entry is picked (see
// User.isPrimaryDoctor and doctorOptions in src/app/front-desk/page.tsx) --
// resolved below to whichever doctor is actually flagged primary, same as
// picking him by name would, just also remembered via bookedAsHospital so
// every screen that displays the assigned doctor can show the label that
// was actually picked.
export const HOSPITAL_DOCTOR_SENTINEL = '__primary_doctor__';

// Creates a new visit/encounter for a patient, assigned to a doctor (FR-3.4).
// One doctor per visit for Phase 1 (BRS Section 8, Decision #1).
export async function createVisit(
  tx: Prisma.TransactionClient,
  input: CreateVisitInput,
): Promise<Visit> {
  const patient = await tx.patient.findFirst({
    where: { id: input.patientId, hospitalId: input.hospitalId },
    select: { id: true },
  });
  if (!patient) {
    throw new Error(`Patient not found: ${input.patientId}`);
  }

  let doctorId = input.doctorId;
  let bookedAsHospital = false;
  if (doctorId === HOSPITAL_DOCTOR_SENTINEL) {
    const primaryDoctor = await tx.user.findFirst({
      where: {
        hospitalId: input.hospitalId,
        role: 'DOCTOR',
        isActive: true,
        isPrimaryDoctor: true,
      },
      select: { id: true },
    });
    if (!primaryDoctor) {
      throw new Error('No primary doctor configured for this hospital.');
    }
    doctorId = primaryDoctor.id;
    bookedAsHospital = true;
  }

  const doctor = await tx.user.findFirst({
    where: { id: doctorId, hospitalId: input.hospitalId, role: 'DOCTOR', isActive: true },
    select: { id: true },
  });
  if (!doctor) {
    throw new Error(`Active doctor not found: ${doctorId}`);
  }

  const tokenNumber = await generateTokenNumber(tx, input.hospitalId);

  const visit = await tx.visit.create({
    data: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      doctorId,
      bookedAsHospital,
      department: input.department,
      visitDate: input.visitDate ?? new Date(),
      tokenNumber,
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'VISIT_CREATED',
    entityType: 'Visit',
    entityId: visit.id,
    metadata: { patientId: visit.patientId, doctorId: visit.doctorId },
  });

  return visit;
}
