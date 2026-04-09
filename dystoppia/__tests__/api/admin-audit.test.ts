import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockAuditFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: mockAuditFindMany },
  },
}));

import { GET } from "@/app/api/admin/audit/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/audit", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const res = await GET(new NextRequest("http://localhost/api/admin/audit"));
    expect(res.status).toBe(403);
  });

  test("returns recent audit entries", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockAuditFindMany.mockResolvedValue([{ id: "audit-1" }]);

    const res = await GET(new NextRequest("http://localhost/api/admin/audit?limit=5"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([{ id: "audit-1" }]);
    expect(mockAuditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      })
    );
  });
});
