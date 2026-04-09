import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    executionRequest: {
      findFirst: mockFindFirst,
    },
  },
}));

import { GET } from "@/app/api/builder/requests/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/builder/requests/[id]", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const res = await GET(new NextRequest("http://localhost/api/builder/requests/req-1"), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(403);
  });

  test("returns detailed request payload", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindFirst.mockResolvedValue({
      id: "req-1",
      prompt: "Inspect this request",
      approvalGates: [{ id: "gate-1" }],
      usageEvents: [{ id: "usage-1" }],
      auditLogs: [{ id: "audit-1" }],
      creditLedger: [{ id: "ledger-1" }],
    });

    const res = await GET(new NextRequest("http://localhost/api/builder/requests/req-1"), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.request).toEqual(
      expect.objectContaining({
        id: "req-1",
        approvalGates: [{ id: "gate-1" }],
        usageEvents: [{ id: "usage-1" }],
        auditLogs: [{ id: "audit-1" }],
        creditLedger: [{ id: "ledger-1" }],
      })
    );
  });
});
