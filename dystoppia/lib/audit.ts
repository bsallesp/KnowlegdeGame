import { prisma } from "@/lib/prisma";

interface AuditMetadata {
  [key: string]: unknown;
}

interface LogAuditEventInput {
  actorUserId?: string;
  actorRole?: string;
  eventType: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  metadata?: AuditMetadata;
}

function encodeMetadata(metadata?: AuditMetadata): string | null {
  return metadata ? JSON.stringify(metadata) : null;
}

export async function logAuditEvent({
  actorUserId,
  actorRole,
  eventType,
  targetType,
  targetId,
  requestId,
  metadata,
}: LogAuditEventInput) {
  return prisma.auditLog.create({
    data: {
      actorUserId,
      actorRole,
      eventType,
      targetType,
      targetId,
      requestId,
      metadataJson: encodeMetadata(metadata),
    },
  });
}
