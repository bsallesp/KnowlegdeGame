import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockGetCurrentCreditBalance = vi.hoisted(() => vi.fn());
const mockCreditLedgerAggregate = vi.hoisted(() => vi.fn());
const mockExecutionRequestCount = vi.hoisted(() => vi.fn());
const mockUsageEventAggregate = vi.hoisted(() => vi.fn());
const mockApprovalGateCount = vi.hoisted(() => vi.fn());
const mockUserCount = vi.hoisted(() => vi.fn());
const mockAuditFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/credits", () => ({
  getCurrentCreditBalance: mockGetCurrentCreditBalance,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    creditLedger: { aggregate: mockCreditLedgerAggregate },
    executionRequest: { count: mockExecutionRequestCount },
    usageEvent: { aggregate: mockUsageEventAggregate },
    approvalGate: { count: mockApprovalGateCount },
    user: { count: mockUserCount },
    auditLog: { findMany: mockAuditFindMany },
  },
}));

import { GET } from "@/app/api/admin/reporting/overview/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/reporting/overview", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const res = await GET(new NextRequest("http://localhost/api/admin/reporting/overview"));
    expect(res.status).toBe(403);
  });

  test("returns accountability summary for master user", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockGetCurrentCreditBalance.mockResolvedValue(250);
    mockCreditLedgerAggregate
      .mockResolvedValueOnce({ _sum: { amount: 275 } })
      .mockResolvedValueOnce({ _sum: { amount: 800 } })
      .mockResolvedValueOnce({ _sum: { amount: 300 } })
      .mockResolvedValueOnce({ _sum: { amount: -25 } })
      .mockResolvedValueOnce({ _sum: { amount: 1000 } })
      .mockResolvedValueOnce({ _sum: { amount: -200 } });
    mockExecutionRequestCount.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    mockUsageEventAggregate
      .mockResolvedValueOnce({ _sum: { actualCostUsd: 1.23, estimatedCostUsd: 1.5 } })
      .mockResolvedValueOnce({ _sum: { actualCostUsd: 5.67, estimatedCostUsd: 6 } });
    mockApprovalGateCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockUserCount.mockResolvedValue(3);
    mockAuditFindMany.mockResolvedValue([{ id: "audit-1", eventType: "builder.request.completed" }]);

    const res = await GET(new NextRequest("http://localhost/api/admin/reporting/overview"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ownAccountability).toEqual(
      expect.objectContaining({
        currentCreditBalance: 250,
        purchasedCredits: 300,
        deductedCredits: 25,
        requestCount: 2,
        actualCostUsd: 1.23,
        pendingApprovalGates: 1,
      })
    );
    expect(body.platformOverview).toEqual(
      expect.objectContaining({
        userCount: 3,
        requestCount: 5,
        purchasedCredits: 1000,
        deductedCredits: 200,
        actualCostUsd: 5.67,
        pendingApprovalGates: 2,
      })
    );
    expect(body.recentAuditEvents).toEqual([{ id: "audit-1", eventType: "builder.request.completed" }]);
  });
});
