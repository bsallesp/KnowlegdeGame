import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Auth guard mock ──────────────────────────────────────────────────────────
const mockRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockUserUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: mockUserUpdate },
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
const { POST } = await import("@/app/api/billing/purchase/route");

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/billing/purchase", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockUserUpdate.mockResolvedValue({
    id: "user-1",
    plan: "learner",
    credits: 500,
    creditsResetsAt: new Date(),
  });
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("POST /api/billing/purchase — auth guard", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(new NextResponse(null, { status: 401 }));
    const res = await POST(makeRequest({ plan: "learner" }));
    expect(res.status).toBe(401);
  });

  test("does not update DB when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(new NextResponse(null, { status: 401 }));
    await POST(makeRequest({ plan: "learner" }));
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("POST /api/billing/purchase — validation", () => {
  test("returns 400 for unknown plan", async () => {
    const res = await POST(makeRequest({ plan: "enterprise" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when plan is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  test("error message mentions valid plans", async () => {
    const res = await POST(makeRequest({ plan: "unknown" }));
    const body = await res.json();
    expect(body.error).toMatch(/free|learner|master/i);
  });
});

// ─── Successful purchase ──────────────────────────────────────────────────────

describe("POST /api/billing/purchase — success", () => {
  test("returns 200 with ok: true", async () => {
    const res = await POST(makeRequest({ plan: "learner" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("updates user plan in DB", async () => {
    await POST(makeRequest({ plan: "master" }));
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ plan: "master" }),
      })
    );
  });

  test("resets credits to plan limit on learner", async () => {
    await POST(makeRequest({ plan: "learner" }));
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ credits: 500 }),
      })
    );
  });

  test("resets credits to plan limit on master", async () => {
    await POST(makeRequest({ plan: "master" }));
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ credits: 2000 }),
      })
    );
  });

  test("sets creditsResetsAt to one month in the future", async () => {
    const before = new Date();
    await POST(makeRequest({ plan: "learner" }));
    const callData = mockUserUpdate.mock.calls[0][0].data;
    const resetAt: Date = callData.creditsResetsAt;
    // Should be at least 27 days ahead and no more than 32 days ahead
    // (setMonth(+1) varies from 28-31 days depending on current month)
    const minMs = 27 * 24 * 60 * 60 * 1000;
    const maxMs = 32 * 24 * 60 * 60 * 1000;
    expect(resetAt.getTime()).toBeGreaterThan(before.getTime() + minMs);
    expect(resetAt.getTime()).toBeLessThan(before.getTime() + maxMs);
  });

  test("returns user data in response", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user-1",
      plan: "learner",
      credits: 500,
      creditsResetsAt: new Date(),
    });
    const res = await POST(makeRequest({ plan: "learner" }));
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.plan).toBe("learner");
    expect(body.user.credits).toBe(500);
  });

  test("allows downgrade to free plan", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user-1",
      plan: "free",
      credits: 50,
      creditsResetsAt: new Date(),
    });
    const res = await POST(makeRequest({ plan: "free" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.plan).toBe("free");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("POST /api/billing/purchase — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockUserUpdate.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeRequest({ plan: "learner" }));
    expect(res.status).toBe(500);
  });

  test("includes error details in 500 response", async () => {
    mockUserUpdate.mockRejectedValue(new Error("constraint violation"));
    const res = await POST(makeRequest({ plan: "learner" }));
    const body = await res.json();
    expect(body.details).toContain("constraint violation");
  });
});
