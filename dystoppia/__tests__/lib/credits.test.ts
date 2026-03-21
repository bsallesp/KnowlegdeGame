import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockFindUnique, update: mockUpdate },
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
  mockUpdate.mockResolvedValue({});
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
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { credits: 40 },
    });
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
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creditsResetsAt: expect.any(Date) }),
      })
    );
  });

  test("does not reset credits when creditsResetsAt is in the future", async () => {
    mockUser({ credits: 20, creditsResetsAt: FUTURE, plan: "master" });
    await deductCredits("user-1", 5);
    const updateCall = mockUpdate.mock.calls[0][0];
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
});
