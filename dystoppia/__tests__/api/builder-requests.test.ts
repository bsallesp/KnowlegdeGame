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
    mockGetCurrentCreditBalance.mockResolvedValue(100);
    mockCreate.mockResolvedValue({ id: "req-1", status: "completed" });
    mockAppendCreditLedgerEvent.mockResolvedValue({ balanceAfter: 82 });

    const res = await POST(
      req({ prompt: "Create a scoped Builder plan for a SaaS that analyzes app competitors." })
    );

    expect(res.status).toBe(200);
    expect(mockAppendCreditLedgerEvent).toHaveBeenCalled();
    expect(mockUsageCreate).toHaveBeenCalled();
  });
});
