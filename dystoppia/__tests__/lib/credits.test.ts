import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique, updateMany: mockUpdateMany },
  },
}));

import { deductCredits, planLimit, CreditError, PLAN_LIMITS } from "@/lib/credits";

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days
const PAST   = new Date(Date.now() - 1);                          // already expired

function mockUser(overrides: Partial<{ credits: number; creditsResetsAt: Date; plan: string }> = {}) {
  mockFindUnique.mockResolvedValue({
    credits: 100,
    creditsResetsAt: FUTURE,
    plan: "free",
    ...overrides,
  });
  mockUpdateMany.mockResolvedValue({ count: 1 });
}

function setupStatefulUser(overrides: Partial<{ credits: number; creditsResetsAt: Date; plan: string }> = {}) {
  const state = {
    credits: 100,
    creditsResetsAt: new Date(FUTURE),
    plan: "free",
    ...overrides,
  };

  mockFindUnique.mockImplementation(async () => ({
    credits: state.credits,
    creditsResetsAt: new Date(state.creditsResetsAt),
    plan: state.plan,
  }));

  mockUpdateMany.mockImplementation(async ({ where, data }) => {
    const whereReset = where.creditsResetsAt as Date;
    const matches =
      where.id === "user-1" &&
      where.credits === state.credits &&
      whereReset?.getTime() === state.creditsResetsAt.getTime();

    if (!matches) {
      return { count: 0 };
    }

    state.credits = data.credits;
    if (data.creditsResetsAt) {
      state.creditsResetsAt = new Date(data.creditsResetsAt);
    }
    return { count: 1 };
  });

  return state;
}

beforeEach(() => vi.clearAllMocks());

// ─── planLimit ────────────────────────────────────────────────────────────────
describe("planLimit()", () => {
  test("returns correct limit for free plan", () => {
    expect(planLimit("free")).toBe(PLAN_LIMITS.free);
  });

  test("returns correct limit for learner plan", () => {
    expect(planLimit("learner")).toBe(PLAN_LIMITS.learner);
  });

  test("returns correct limit for master plan", () => {
    expect(planLimit("master")).toBe(PLAN_LIMITS.master);
  });

  test("falls back to free limit for unknown plan", () => {
    expect(planLimit("unknown_plan")).toBe(PLAN_LIMITS.free);
  });
});

// ─── deductCredits ────────────────────────────────────────────────────────────
describe("deductCredits()", () => {
  test("deducts amount and returns remaining credits", async () => {
    mockUser({ credits: 50 });
    const remaining = await deductCredits("user-1", 10);
    expect(remaining).toBe(40);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "user-1", credits: 50 }),
        data: { credits: 40 },
      })
    );
  });

  test("throws CreditError when credits are insufficient", async () => {
    mockUser({ credits: 5 });
    await expect(deductCredits("user-1", 10)).rejects.toThrow(CreditError);
  });

  test("CreditError contains remaining credits", async () => {
    mockUser({ credits: 3 });
    try {
      await deductCredits("user-1", 10);
    } catch (e) {
      expect(e).toBeInstanceOf(CreditError);
      expect((e as CreditError).remaining).toBe(3);
    }
  });

  test("allows exact credit deduction (credits === amount)", async () => {
    mockUser({ credits: 10 });
    const remaining = await deductCredits("user-1", 10);
    expect(remaining).toBe(0);
  });

  test("throws when user is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(deductCredits("missing-user", 1)).rejects.toThrow("User not found");
  });

  test("performs lazy monthly reset when creditsResetsAt is in the past", async () => {
    mockUser({ credits: 0, creditsResetsAt: PAST, plan: "learner" });
    const remaining = await deductCredits("user-1", 1);
    expect(remaining).toBe(PLAN_LIMITS.learner - 1);
    // update must include new creditsResetsAt
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creditsResetsAt: expect.any(Date) }),
      })
    );
  });

  test("does not reset credits when creditsResetsAt is in the future", async () => {
    mockUser({ credits: 20, creditsResetsAt: FUTURE, plan: "master" });
    await deductCredits("user-1", 5);
    const updateCall = mockUpdateMany.mock.calls[0][0];
    expect(updateCall.data.creditsResetsAt).toBeUndefined();
    expect(updateCall.data.credits).toBe(15);
  });

  test("after reset uses plan limit, then deducts amount", async () => {
    mockUser({ credits: 0, creditsResetsAt: PAST, plan: "free" });
    const remaining = await deductCredits("user-1", 3);
    expect(remaining).toBe(PLAN_LIMITS.free - 3);
  });

  test("throws CreditError after reset if amount exceeds plan limit", async () => {
    mockUser({ credits: 0, creditsResetsAt: PAST, plan: "free" });
    await expect(deductCredits("user-1", PLAN_LIMITS.free + 1)).rejects.toThrow(CreditError);
  });

  test("concurrent deductions allow only one success when funds are insufficient for both", async () => {
    setupStatefulUser({ credits: 50, creditsResetsAt: FUTURE, plan: "free" });

    const results = await Promise.allSettled([
      deductCredits("user-1", 30),
      deductCredits("user-1", 30),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as Array<PromiseFulfilledResult<number>>;
    const rejected = results.filter((r) => r.status === "rejected") as Array<PromiseRejectedResult>;

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value).toBe(20);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(CreditError);
  });

  test("concurrent reset path applies reset timestamp only once", async () => {
    const baseResetAt = new Date(PAST);
    const state = setupStatefulUser({ credits: 0, creditsResetsAt: baseResetAt, plan: "learner" });

    await Promise.all([
      deductCredits("user-1", 1),
      deductCredits("user-1", 1),
    ]);

    expect(mockUpdateMany.mock.calls.length).toBeGreaterThanOrEqual(2);
    const callsWithResetField = mockUpdateMany.mock.calls.filter(
      (call) => call[0].data.creditsResetsAt instanceof Date
    );
    expect(callsWithResetField.length).toBeGreaterThanOrEqual(1);

    // Business invariant: two deductions happened after a single monthly reset window advance.
    expect(state.credits).toBe(PLAN_LIMITS.learner - 2);
    const expectedResetAt = new Date(baseResetAt);
    expectedResetAt.setMonth(expectedResetAt.getMonth() + 1);
    expect(state.creditsResetsAt.getTime()).toBe(expectedResetAt.getTime());
  });
});

describe("deductCredits() — atomicity roadmap", () => {
  test.todo("records and replays idempotent credit deductions with a client request key");
  test.todo("exposes deterministic conflict reason for concurrent retries");
});
