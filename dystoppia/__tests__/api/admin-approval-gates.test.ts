import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    approvalGate: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

import { GET } from "@/app/api/admin/approval-gates/route";
import { POST } from "@/app/api/admin/approval-gates/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/approval-gates", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const res = await GET(new NextRequest("http://localhost/api/admin/approval-gates"));
    expect(res.status).toBe(403);
  });

  test("returns approval gates for master user", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindMany.mockResolvedValue([{ id: "gate-1" }]);

    const res = await GET(new NextRequest("http://localhost/api/admin/approval-gates?limit=3"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gates).toEqual([{ id: "gate-1" }]);
  });
});

describe("POST /api/admin/approval-gates/[id]", () => {
  test("validates decision", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const res = await POST(
      new NextRequest("http://localhost/api/admin/approval-gates/gate-1", {
        method: "POST",
        body: JSON.stringify({ decision: "maybe" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "gate-1" }) }
    );

    expect(res.status).toBe(400);
  });

  test("resolves gate and writes audit event", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindUnique.mockResolvedValue({
      id: "gate-1",
      status: "not_available_in_mvp",
      requestId: "req-1",
      request: { id: "req-1", userId: "master-1" },
    });
    mockUpdate.mockResolvedValue({ id: "gate-1", status: "approved" });

    const res = await POST(
      new NextRequest("http://localhost/api/admin/approval-gates/gate-1", {
        method: "POST",
        body: JSON.stringify({ decision: "approved", note: "manual triage" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "gate-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "gate-1" },
        data: expect.objectContaining({
          status: "approved",
          resolvedByUserId: "master-1",
        }),
      })
    );
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "approval_gate.approved",
        targetId: "gate-1",
      })
    );
  });
});
