import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireUser = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUserUpdate = vi.hoisted(() => vi.fn());
const mockCustomersCreate = vi.hoisted(() => vi.fn());
const mockCheckoutCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique, update: mockUserUpdate },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
  },
  STRIPE_PLAN_PRICES: { learner: "price_learner", master: "price_master" },
}));

import { POST } from "@/app/api/billing/checkout/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockFindUnique.mockReset();
  mockUserUpdate.mockReset();
  mockCustomersCreate.mockReset();
  mockCheckoutCreate.mockReset();
});

describe("POST /api/billing/checkout", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(NextResponse.json({ error: "nope" }, { status: 401 }));
    const res = await POST(req({ plan: "learner" }));
    expect(res.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for invalid plan", async () => {
    const res = await POST(req({ plan: "enterprise" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid plan");
  });

  test("returns 404 when user missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(req({ plan: "learner" }));
    expect(res.status).toBe(404);
  });

  test("creates Stripe customer when none stored and returns checkout url", async () => {
    mockFindUnique.mockResolvedValue({ email: "a@b.com", stripeCustomerId: null });
    mockCustomersCreate.mockResolvedValue({ id: "cus_new" });
    mockUserUpdate.mockResolvedValue({});
    mockCheckoutCreate.mockResolvedValue({ url: "https://stripe.test/session" });

    const res = await POST(req({ plan: "learner" }));
    expect(res.status).toBe(200);
    expect(mockCustomersCreate).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { stripeCustomerId: "cus_new" },
    });
    expect(mockCheckoutCreate).toHaveBeenCalled();
    const body = await res.json();
    expect(body.url).toBe("https://stripe.test/session");
  });

  test("reuses existing stripeCustomerId", async () => {
    mockFindUnique.mockResolvedValue({ email: "a@b.com", stripeCustomerId: "cus_x" });
    mockCheckoutCreate.mockResolvedValue({ url: "https://stripe.test/s2" });

    await POST(req({ plan: "master" }));

    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_x",
        line_items: [{ price: "price_master", quantity: 1 }],
        metadata: { userId: "user-1", plan: "master" },
      }),
    );
  });
});
