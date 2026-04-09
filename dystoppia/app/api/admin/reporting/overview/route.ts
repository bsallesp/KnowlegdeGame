import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { getCurrentCreditBalance } from "@/lib/credits";

function asPositiveCredits(sum: number | null | undefined) {
  return Math.max(0, sum ?? 0);
}

function asDeductedCredits(sum: number | null | undefined) {
  return Math.abs(Math.min(0, sum ?? 0));
}

function asUsd(sum: number | null | undefined) {
  return Number((sum ?? 0).toFixed(4));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const [
      ownBalance,
      ownLedger,
      ownRequestCount,
      ownUsage,
      ownPendingApprovals,
      platformUserCount,
      platformLedger,
      platformRequestCount,
      platformUsage,
      platformPendingApprovals,
      recentAuditEvents,
    ] = await Promise.all([
      getCurrentCreditBalance(auth.userId),
      prisma.creditLedger.aggregate({
        where: { userId: auth.userId },
        _sum: { amount: true },
      }),
      prisma.executionRequest.count({
        where: { userId: auth.userId },
      }),
      prisma.usageEvent.aggregate({
        where: { userId: auth.userId },
        _sum: { actualCostUsd: true, estimatedCostUsd: true },
      }),
      prisma.approvalGate.count({
        where: {
          request: { userId: auth.userId },
          resolvedAt: null,
        },
      }),
      prisma.user.count(),
      prisma.creditLedger.aggregate({
        _sum: { amount: true },
      }),
      prisma.executionRequest.count(),
      prisma.usageEvent.aggregate({
        _sum: { actualCostUsd: true, estimatedCostUsd: true },
      }),
      prisma.approvalGate.count({
        where: { resolvedAt: null },
      }),
      prisma.auditLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10,
      }),
    ]);

    const ownPurchasedCredits = await prisma.creditLedger.aggregate({
      where: { userId: auth.userId, amount: { gt: 0 } },
      _sum: { amount: true },
    });

    const ownDeductedCredits = await prisma.creditLedger.aggregate({
      where: { userId: auth.userId, amount: { lt: 0 } },
      _sum: { amount: true },
    });

    const platformPurchasedCredits = await prisma.creditLedger.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    });

    const platformDeductedCredits = await prisma.creditLedger.aggregate({
      where: { amount: { lt: 0 } },
      _sum: { amount: true },
    });

    return NextResponse.json({
      ownAccountability: {
        currentCreditBalance: ownBalance,
        purchasedCredits: asPositiveCredits(ownPurchasedCredits._sum.amount),
        deductedCredits: asDeductedCredits(ownDeductedCredits._sum.amount),
        requestCount: ownRequestCount,
        actualCostUsd: asUsd(ownUsage._sum.actualCostUsd ?? ownUsage._sum.estimatedCostUsd),
        pendingApprovalGates: ownPendingApprovals,
      },
      platformOverview: {
        userCount: platformUserCount,
        requestCount: platformRequestCount,
        purchasedCredits: asPositiveCredits(platformPurchasedCredits._sum.amount ?? platformLedger._sum.amount),
        deductedCredits: asDeductedCredits(platformDeductedCredits._sum.amount),
        actualCostUsd: asUsd(platformUsage._sum.actualCostUsd ?? platformUsage._sum.estimatedCostUsd),
        pendingApprovalGates: platformPendingApprovals,
      },
      recentAuditEvents,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch reporting overview", details: String(error) },
      { status: 500 }
    );
  }
}
