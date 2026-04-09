import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockAdjustCredits = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/credits", () => ({
  adjustCredits: mockAdjustCredits,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

import { POST } from "@/app/api/admin/credits/adjust/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/credits/adjust", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/credits/adjust", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await POST(req({ userId: "user-1", amount: 10, reason: "seed" }));
    expect(res.status).toBe(403);
  });

  test("validates request body", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const res = await POST(req({ userId: "", amount: 0, reason: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 404 when target user does not exist", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(req({ userId: "user-1", amount: 10, reason: "seed balance" }));
    expect(res.status).toBe(404);
  });

  test("adjusts credits for valid requests", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockUserFindUnique.mockResolvedValue({ id: "user-1" });
    mockAdjustCredits.mockResolvedValue({
      id: "ledger-1",
      amount: 25,
      balanceAfter: 25,
    });

    const res = await POST(req({ userId: "user-1", amount: 25, reason: "initial credit load" }));
    expect(res.status).toBe(200);
    expect(mockAdjustCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: 25,
        actorUserId: "master-1",
        actorRole: "master",
      })
    );
  });
});
