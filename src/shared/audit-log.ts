import type { Prisma } from '@prisma/client';

// Appends an audit trail entry (FR-2.5 / TRD Section 8) within the same
// transaction as the write it's recording, so the log can never exist
// without the action it describes (or vice versa).
export async function recordAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    hospitalId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      hospitalId: params.hospitalId,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata,
    },
  });
}
