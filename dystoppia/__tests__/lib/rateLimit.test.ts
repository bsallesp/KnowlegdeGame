import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique, updateMany: mockUpdateMany } },
}));

import {
  checkRateLimit,
  getRateLimitState,
  RateLimitError,
} from "@/lib/rateLimit";

const t0 = new Date("2026-03-01T10:00:00.000Z");

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    plan: "free",
    hourlyUsage: 0,
    hourlyWindowStart: t0,
    hourlyCurriculumUsage: 0,
    weeklyUsage: 0,
    weeklyWindowStart: t0,
    weeklyCurriculumUsage: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T10:15:00.000Z"));
  mockFindUnique.mockReset();
  mockUpdateMany.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  test("increments question usage and returns state", async () => {
    mockFindUnique.mockResolvedValue(baseUser());
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const state = await checkRateLimit("uid", 1, "question");

    expect(mockUpdateMany).toHaveBeenCalled();
    expect(state.hourlyUsage).toBe(1);
    expect(state.hourlyRemaining).toBe(4);
    expect(state.weeklyUsage).toBe(1);
    expect(state.weeklyRemaining).toBe(29);
  });

  test("throws RateLimitError when hourly question cap reached", async () => {
    mockFindUnique.mockResolvedValue(baseUser({ hourlyUsage: 5 }));

    await expect(checkRateLimit("uid", 1, "question")).rejects.toMatchObject({
      name: "RateLimitError",
      window: "hourly",
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("throws when user not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(checkRateLimit("uid", 1, "question")).rejects.toThrow(/User not found/);
  });

  test("throws after repeated optimistic-lock failures", async () => {
    mockFindUnique.mockResolvedValue(baseUser());
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(checkRateLimit("uid", 1, "question")).rejects.toThrow(
      /concurrent updates/,
    );
    expect(mockUpdateMany.mock.calls.length).toBe(5);
  });
});

describe("getRateLimitState", () => {
  test("returns remaining without mutating", async () => {
    mockFindUnique.mockResolvedValue(baseUser({ hourlyUsage: 2, weeklyUsage: 10 }));

    const state = await getRateLimitState("uid");

    expect(state.hourlyUsage).toBe(2);
    expect(state.hourlyRemaining).toBe(3);
    expect(state.weeklyUsage).toBe(10);
    expect(state.weeklyRemaining).toBe(20);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("throws when user missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(getRateLimitState("uid")).rejects.toThrow(/User not found/);
  });
});

describe("RateLimitError", () => {
  test("is instanceof Error", () => {
    const err = new RateLimitError("hourly", 0, new Date());
    expect(err).toBeInstanceOf(Error);
    expect(err.window).toBe("hourly");
  });
});
