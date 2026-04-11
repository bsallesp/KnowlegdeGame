import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";

export type CreditLedgerEventType =
  | "top_up"
  | "reserved"
  | "released"
  | "settled"
  | "deduction"
  | "refund"
  | "adjustment"
  | "manual_adjustment";

interface LedgerMetadata {
  [key: string]: unknown;
}

interface AppendCreditLedgerEventInput {
  userId: string;
  requestId?: string;
  eventType: CreditLedgerEventType;
  amount: number;
  reason: string;
  metadata?: LedgerMetadata;
  createdByUserId?: string;
}

interface AdjustCreditsInput {
  userId: string;
  amount: number;
  reason: string;
  actorUserId?: string;
  actorRole?: string;
  metadata?: LedgerMetadata;
}

function encodeMetadata(metadata?: LedgerMetadata): string | null {
  return metadata ? JSON.stringify(metadata) : null;
}

async function getLatestBalanceForUser(userId: string) {
  const latest = await prisma.creditLedger.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { balanceAfter: true },
  });

  return latest?.balanceAfter ?? 0;
}

async function appendCreditLedgerEventWithClient(
  tx: Prisma.TransactionClient,
  {
    userId,
    requestId,
    eventType,
    amount,
    reason,
    metadata,
    createdByUserId,
  }: AppendCreditLedgerEventInput
) {
  const latest = await tx.creditLedger.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { balanceAfter: true },
  });

  const currentBalance = latest?.balanceAfter ?? 0;
  const balanceAfter = currentBalance + amount;

  if (balanceAfter < 0) {
    throw new Error("Insufficient credits");
  }

  return tx.creditLedger.create({
    data: {
      userId,
      requestId,
      eventType,
      amount,
      balanceAfter,
      reason,
      metadataJson: encodeMetadata(metadata),
      createdByUserId,
    },
  });
}

export async function getCurrentCreditBalance(userId: string): Promise<number> {
  return getLatestBalanceForUser(userId);
}

export async function listCreditLedger(userId: string, limit = 50) {
  return prisma.creditLedger.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100),
  });
}

export async function appendCreditLedgerEvent({
  userId,
  requestId,
  eventType,
  amount,
  reason,
  metadata,
  createdByUserId,
}: AppendCreditLedgerEventInput) {
  if (!Number.isInteger(amount)) {
    throw new Error("Credit amount must be an integer");
  }
  if (amount === 0) {
    throw new Error("Credit amount cannot be zero");
  }

  return prisma.$transaction(async (tx) => {
    return appendCreditLedgerEventWithClient(tx, {
      userId,
      requestId,
      eventType,
      amount,
      reason,
      metadata,
      createdByUserId,
    });
  });
}

export async function appendCreditLedgerEventInTransaction(
  tx: Prisma.TransactionClient,
  input: AppendCreditLedgerEventInput
) {
  if (!Number.isInteger(input.amount)) {
    throw new Error("Credit amount must be an integer");
  }
  if (input.amount === 0) {
    throw new Error("Credit amount cannot be zero");
  }

  return appendCreditLedgerEventWithClient(tx, input);
}

export async function adjustCredits({
  userId,
  amount,
  reason,
  actorUserId,
  actorRole,
  metadata,
}: AdjustCreditsInput) {
  const eventType: CreditLedgerEventType =
    amount > 0 ? "top_up" : "manual_adjustment";

  const entry = await appendCreditLedgerEvent({
    userId,
    eventType,
    amount,
    reason,
    metadata,
    createdByUserId: actorUserId,
  });

  await logAuditEvent({
    actorUserId,
    actorRole,
    eventType: "credits.adjusted",
    targetType: "user",
    targetId: userId,
    metadata: {
      amount,
      balanceAfter: entry.balanceAfter,
      reason,
      ledgerEventType: eventType,
    },
  });

  return entry;
}
