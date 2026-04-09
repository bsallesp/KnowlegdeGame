import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockRetrieve = vi.hoisted(() => vi.fn());
const mockUserUpdate = vi.hoisted(() => vi.fn());
const mockUserFindFirst = vi.hoisted(() => vi.fn());
const mockProcessedEventCreate = vi.hoisted(() => vi.fn());
const mockAppendCreditLedgerEventInTransaction = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: mockUserUpdate, findFirst: mockUserFindFirst },
    processedStripeEvent: { create: mockProcessedEventCreate },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/credits", () => ({
  appendCreditLedgerEventInTransaction: mockAppendCreditLedgerEventInTransaction,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve },
  },
  planFromPriceId: (id: string) => (id === "price_learner" ? "learner" : id === "price_master" ? "master" : null),
}));

import { POST } from "@/app/api/billing/webhook/route";

function postEvent(body: string, signature = "sig_test") {
  return new NextRequest("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  mockConstructEvent.mockReset();
  mockRetrieve.mockReset();
  mockUserUpdate.mockReset();
  mockUserFindFirst.mockReset();
  mockProcessedEventCreate.mockReset();
  mockAppendCreditLedgerEventInTransaction.mockReset();
  mockLogAuditEvent.mockReset();
  mockTransaction.mockReset();
  mockUserUpdate.mockResolvedValue({});
  mockProcessedEventCreate.mockResolvedValue({});
  mockAppendCreditLedgerEventInTransaction.mockResolvedValue({ balanceAfter: 300 });
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      processedStripeEvent: { create: mockProcessedEventCreate },
    })
  );
});

describe("POST /api/billing/webhook", () => {
  test("400 without stripe-signature", async () => {
    const req = new NextRequest("http://localhost/api/billing/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing stripe-signature/i);
  });

  test("500 when STRIPE_WEBHOOK_SECRET unset", async () => {
    vi.unstubAllEnvs();
    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(500);
  });

  test("400 on invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(400);
  });

  test("returns 500 when a handler throws after valid signature", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_sub_fail",
      type: "checkout.session.completed",
      livemode: false,
      created: 1700000000,
      data: {
        object: {
          metadata: { userId: "u1", purchaseType: "subscription" },
          subscription: "sub_fail",
        },
      },
    });
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_learner" } }] },
    });
    mockUserUpdate.mockRejectedValue(new Error("database locked"));

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Handler error");
  });

  test("checkout.session.completed without userId skips prisma update", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_missing_user",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {},
          subscription: "sub_only",
        },
      },
    });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("checkout.session.completed without subscription skips prisma update", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_missing_sub",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "u1" },
          subscription: null,
        },
      },
    });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("checkout.session.completed updates user", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_sub_1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { userId: "u1", purchaseType: "subscription" },
          subscription: "sub_abc",
        },
      },
    });
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_learner" } }] },
    });

    const res = await POST(postEvent('{"type":"checkout.session.completed"}'));
    expect(res.status).toBe(200);
    expect(mockProcessedEventCreate).toHaveBeenCalled();
    expect(mockRetrieve).toHaveBeenCalledWith("sub_abc");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        stripeSubscriptionId: "sub_abc",
        subscriptionStatus: "active",
        plan: "learner",
        weeklyUsage: 0,
      }),
    });
  });

  test("checkout.session.completed for credits tops up ledger", async () => {
    mockConstructEvent.mockReturnValue({
      id: "evt_credit_1",
      type: "checkout.session.completed",
      livemode: false,
      created: 1700000000,
      data: {
        object: {
          id: "cs_123",
          payment_status: "paid",
          amount_total: 3900,
          currency: "usd",
          metadata: {
            userId: "u1",
            purchaseType: "credits",
            packageId: "builder_300",
            credits: "300",
          },
        },
      },
    });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockAppendCreditLedgerEventInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        processedStripeEvent: { create: mockProcessedEventCreate },
      }),
      expect.objectContaining({
        userId: "u1",
        eventType: "top_up",
        amount: 300,
      })
    );
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.credit_purchase.completed",
        targetId: "u1",
      })
    );
  });

  test("duplicate credit checkout event is ignored", async () => {
    mockProcessedEventCreate.mockRejectedValue({ code: "P2002" });
    mockConstructEvent.mockReturnValue({
      id: "evt_credit_dup",
      type: "checkout.session.completed",
      livemode: false,
      created: 1700000000,
      data: {
        object: {
          id: "cs_dup",
          payment_status: "paid",
          amount_total: 1500,
          currency: "usd",
          metadata: {
            userId: "u1",
            purchaseType: "credits",
            packageId: "starter_100",
            credits: "100",
          },
        },
      },
    });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockAppendCreditLedgerEventInTransaction).not.toHaveBeenCalled();
  });

  test("customer.subscription.updated does nothing when no user matches subscription", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_orphan",
          status: "active",
          items: { data: [{ price: { id: "price_master" } }] },
        },
      },
    });
    mockUserFindFirst.mockResolvedValue(null);

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("customer.subscription.updated changes plan", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_x",
          status: "active",
          items: { data: [{ price: { id: "price_master" } }] },
        },
      },
    });
    mockUserFindFirst.mockResolvedValue({ id: "user-x" });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-x" },
      data: { plan: "master", subscriptionStatus: "active" },
    });
  });

  test("customer.subscription.deleted does nothing when no user matches", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_orphan_del" } },
    });
    mockUserFindFirst.mockResolvedValue(null);

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("customer.subscription.deleted downgrades to free", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_y" } },
    });
    mockUserFindFirst.mockResolvedValue({ id: "user-y" });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-y" },
      data: { plan: "free", subscriptionStatus: "canceled" },
    });
  });

  test("invoice.payment_failed without subscription id skips updates", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {},
      },
    });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("invoice.payment_failed does nothing when user not found", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: { subscription: "sub_unknown" },
      },
    });
    mockUserFindFirst.mockResolvedValue(null);

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("invoice.payment_failed sets past_due", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          subscription: "sub_z",
        },
      },
    });
    mockUserFindFirst.mockResolvedValue({ id: "user-z" });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-z" },
      data: { subscriptionStatus: "past_due" },
    });
  });

  test("invoice.payment_failed via Stripe 2026 parent.subscription_details format", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: {
            subscription_details: { subscription: "sub_2026" },
          },
        },
      },
    });
    mockUserFindFirst.mockResolvedValue({ id: "user-2026" });

    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeSubscriptionId: "sub_2026" } }),
    );
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-2026" },
      data: { subscriptionStatus: "past_due" },
    });
  });

  test("ignores unhandled event types", async () => {
    mockConstructEvent.mockReturnValue({ type: "charge.succeeded", data: { object: {} } });
    const res = await POST(postEvent("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
