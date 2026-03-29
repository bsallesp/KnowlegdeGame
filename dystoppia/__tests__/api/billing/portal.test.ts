import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireUser = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockPortalCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { billingPortal: { sessions: { create: mockPortalCreate } } },
}));

import { POST } from "@/app/api/billing/portal/route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://app.test");
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockFindUnique.mockReset();
  mockPortalCreate.mockReset();
});

describe("POST /api/billing/portal", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(NextResponse.json({ error: "nope" }, { status: 401 }));
    const res = await POST(new NextRequest("http://localhost/api/billing/portal", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  test("returns 400 when no Stripe customer", async () => {
    mockFindUnique.mockResolvedValue({ stripeCustomerId: null });
    const res = await POST(new NextRequest("http://localhost/api/billing/portal", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active subscription/i);
  });

  test("returns 400 when user row is missing (no stripeCustomerId)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/billing/portal", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active subscription/i);
  });

  test("returns portal url", async () => {
    mockFindUnique.mockResolvedValue({ stripeCustomerId: "cus_123" });
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal" });
    const res = await POST(new NextRequest("http://localhost/api/billing/portal", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://app.test/profile",
    });
    const body = await res.json();
    expect(body.url).toBe("https://billing.stripe.com/portal");
  });

  test("returns 500 when billingPortal.sessions.create throws", async () => {
    mockFindUnique.mockResolvedValue({ stripeCustomerId: "cus_123" });
    mockPortalCreate.mockRejectedValue(new Error("portal unavailable"));

    const res = await POST(new NextRequest("http://localhost/api/billing/portal", { method: "POST" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create portal session");
    expect(String(body.details)).toContain("portal unavailable");
  });
});
