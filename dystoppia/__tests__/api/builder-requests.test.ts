import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockGetCurrentCreditBalance = vi.hoisted(() => vi.fn());
const mockAppendCreditLedgerEvent = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockUsageCreate = vi.hoisted(() => vi.fn());
const mockApprovalCreate = vi.hoisted(() => vi.fn());
const mockBuildStructuredBuilderResult = vi.hoisted(() => vi.fn());
const mockEstimateCredits = vi.hoisted(() => vi.fn());
const mockSettleCredits = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/builder", () => ({
  buildStructuredBuilderResult: mockBuildStructuredBuilderResult,
}));

vi.mock("@/lib/pricing", () => ({
  estimateCredits: mockEstimateCredits,
  settleCredits: mockSettleCredits,
}));

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/credits", () => ({
  getCurrentCreditBalance: mockGetCurrentCreditBalance,
  appendCreditLedgerEvent: mockAppendCreditLedgerEvent,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    executionRequest: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
    usageEvent: {
      create: mockUsageCreate,
    },
    approvalGate: {
      create: mockApprovalCreate,
    },
  },
}));

import { GET, POST } from "@/app/api/builder/requests/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/builder/requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/builder/requests", () => {
  test("returns request history for master", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindMany.mockResolvedValue([{ id: "req-1" }]);

    const res = await GET(new NextRequest("http://localhost/api/builder/requests"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toEqual([{ id: "req-1" }]);
  });
});

describe("POST /api/builder/requests", () => {
  test("rejects short prompts", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const res = await POST(req({ prompt: "too short" }));
    expect(res.status).toBe(400);
  });

  test("rejects when there are not enough credits", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockEstimateCredits.mockResolvedValue({ bufferedCredits: 50, rawCostUsd: 0.01, multiplier: 1, chargedCostUsd: 0.01, creditValueUsd: 0.001, rawCredits: 10, floorCredits: 10, finalCredits: 10, bufferFraction: 0.25 });
    mockGetCurrentCreditBalance.mockResolvedValue(0);
    mockCreate.mockResolvedValue({ id: "req-1", status: "rejected" });

    const res = await POST(
      req({ prompt: "Create a complete builder plan for a competitor analysis app." })
    );
    expect(res.status).toBe(402);
  });

  test("creates a completed request and deducts credits when viable", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockEstimateCredits.mockResolvedValue({ bufferedCredits: 10, rawCostUsd: 0.005, multiplier: 1, chargedCostUsd: 0.005, creditValueUsd: 0.001, rawCredits: 5, floorCredits: 5, finalCredits: 5, bufferFraction: 0.25 });
    mockGetCurrentCreditBalance.mockResolvedValue(100);
    mockCreate.mockResolvedValue({ id: "req-1", status: "processing" });
    mockAppendCreditLedgerEvent.mockResolvedValue({ balanceAfter: 90 });
    mockBuildStructuredBuilderResult.mockResolvedValue({ costSummary: { _realTokens: null }, warnings: [], result: {} });
    mockSettleCredits.mockResolvedValue({ action: "exact", difference: 0, realCostUsd: 0.005, realCredits: 5, settledCredits: 5 });
    mockUpdate.mockResolvedValue({ id: "req-1", status: "completed" });
    mockUsageCreate.mockResolvedValue({});

    const res = await POST(
      req({ prompt: "Create a scoped Builder plan for a SaaS that analyzes app competitors." })
    );

    expect(res.status).toBe(200);
    expect(mockAppendCreditLedgerEvent).toHaveBeenCalled();
    expect(mockUsageCreate).toHaveBeenCalled();
  });
});
