import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireUser = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockGetCurrentCreditBalance = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));
vi.mock("@/lib/credits", () => ({
  getCurrentCreditBalance: mockGetCurrentCreditBalance,
}));
vi.mock("@/lib/stripe", () => ({
  CREDIT_PACKAGES: [
    {
      id: "builder_300",
      name: "Builder 300",
      credits: 300,
      unitAmountCents: 3900,
      description: "Balanced package",
    },
  ],
}));

import { GET } from "@/app/api/billing/status/route";

const windowStart = new Date("2026-01-15T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:30:00.000Z"));
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockFindUnique.mockReset();
  mockGetCurrentCreditBalance.mockReset();
  mockGetCurrentCreditBalance.mockResolvedValue(180);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/billing/status", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(NextResponse.json({ error: "nope" }, { status: 401 }));
    const res = await GET(new NextRequest("http://localhost/api/billing/status"));
    expect(res.status).toBe(401);
  });

  test("returns 404 when user missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/billing/status"));
    expect(res.status).toBe(404);
  });

  test("returns usage within windows for free plan", async () => {
    mockFindUnique.mockResolvedValue({
      plan: "free",
      subscriptionStatus: "inactive",
      hourlyUsage: 2,
      hourlyWindowStart: windowStart,
    });
    const res = await GET(new NextRequest("http://localhost/api/billing/status"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("free");
    expect(body.hourlyUsage).toBe(2);
    expect(body.hourlyRemaining).toBe(3);
    expect(body.creditBalance).toBe(180);
    expect(body.creditPackages).toHaveLength(1);
  });

  test("resets hourly counter when hour window expired", async () => {
    vi.setSystemTime(new Date(windowStart.getTime() + 70 * 60 * 1000));
    mockFindUnique.mockResolvedValue({
      plan: "free",
      subscriptionStatus: "active",
      hourlyUsage: 5,
      hourlyWindowStart: windowStart,
    });
    const res = await GET(new NextRequest("http://localhost/api/billing/status"));
    const body = await res.json();
    expect(body.hourlyUsage).toBe(0);
    expect(body.hourlyRemaining).toBe(5);
  });
});
