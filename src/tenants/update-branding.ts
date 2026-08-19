import type { Hospital, Prisma } from '@prisma/client';

import { recordAuditLog } from '@/shared';

// FR-1.2/FR-1.3: lets a Hospital Admin edit the branding fields already on
// the Hospital model. `hospitals` carries no hospital_id of its own and has
// no RLS policy (it's the tenant root, not tenant-owned -- see
// prisma/migrations/*_add_row_level_security), so writing to it through the
// RLS-scoped `tx` from withHospitalContext works the same as any other
// table on that connection; the transaction is only needed here so the
// accompanying AuditLog write (which *is* tenant-owned) can share it.
export interface UpdateHospitalBrandingInput {
  hospitalId: string;
  actorId: string;
  name: string;
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
  gstin?: string;
  registrationNumber?: string;
  themeColor?: string;
  logoUrl?: string;
  upiQrCodeUrl?: string;
}

export async function updateHospitalBranding(
  tx: Prisma.TransactionClient,
  input: UpdateHospitalBrandingInput,
): Promise<Hospital> {
  const hospital = await tx.hospital.update({
    where: { id: input.hospitalId },
    data: {
      name: input.name,
      address: input.address ?? null,
      contactPhone: input.contactPhone ?? null,
      contactEmail: input.contactEmail ?? null,
      gstin: input.gstin ?? null,
      registrationNumber: input.registrationNumber ?? null,
      themeColor: input.themeColor ?? null,
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      ...(input.upiQrCodeUrl ? { upiQrCodeUrl: input.upiQrCodeUrl } : {}),
    },
  });

  await recordAuditLog(tx, {
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: 'HOSPITAL_BRANDING_UPDATED',
    entityType: 'Hospital',
    entityId: input.hospitalId,
  });

  return hospital;
}
