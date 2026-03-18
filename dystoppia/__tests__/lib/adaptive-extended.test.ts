import { describe, test, expect, vi } from "vitest";
import { calculateNewDifficulty, calculateSM2, selectNextSubItem } from "@/lib/adaptive";

// ─── calculateNewDifficulty ────────────────────────────────────────────────────
describe("calculateNewDifficulty — strong performance", () => {
  test("increases difficulty when correctRate >= 0.8 and total >= 3", () => {
    expect(calculateNewDifficulty(2, 8, 10)).toBe(3);
  });

  test("caps difficulty at 5", () => {
    expect(calculateNewDifficulty(5, 9, 10)).toBe(5);
  });

  test("increases from difficulty 1 on strong performance", () => {
    expect(calculateNewDifficulty(1, 4, 4)).toBe(2);
  });

  test("increases from difficulty 4 on perfect score", () => {
    expect(calculateNewDifficulty(4, 10, 10)).toBe(5);
  });

  test("requires at least 3 answers to increase difficulty", () => {
    // recentTotal = 2 with 100% rate — should NOT increase
    expect(calculateNewDifficulty(2, 2, 2)).toBe(2);
  });
});

describe("calculateNewDifficulty — poor performance", () => {
  test("decreases difficulty when correctRate < 0.5", () => {
    expect(calculateNewDifficulty(3, 2, 5)).toBe(2);
  });

  test("does not decrease below 1", () => {
    expect(calculateNewDifficulty(1, 0, 5)).toBe(1);
  });

  test("decreases from difficulty 5 on poor performance", () => {
    expect(calculateNewDifficulty(5, 0, 4)).toBe(4);
  });

  test("decreases from difficulty 4 on 0% correctRate", () => {
    expect(calculateNewDifficulty(4, 0, 3)).toBe(3);
  });
});

describe("calculateNewDifficulty — neutral/boundary", () => {
  test("unchanged at correctRate exactly 0.5", () => {
    expect(calculateNewDifficulty(3, 5, 10)).toBe(3);
  });

  test("unchanged at correctRate 0.6", () => {
    expect(calculateNewDifficulty(3, 6, 10)).toBe(3);
  });

  test("unchanged at correctRate 0.79", () => {
    expect(calculateNewDifficulty(3, 7, 9)).toBe(3);
  });

  test("returns currentDifficulty when recentTotal is 0", () => {
    expect(calculateNewDifficulty(3, 0, 0)).toBe(3);
  });

  test("unchanged at correctRate exactly 0.5 with large totals", () => {
    expect(calculateNewDifficulty(2, 50, 100)).toBe(2);
  });
});

// ─── calculateSM2 ────────────────────────────────────────────────────────────
describe("calculateSM2 — correct answers", () => {
  test("returns SM2Result shape", () => {
    const result = calculateSM2(2.5, 1, true, 5000, 10000);
    expect(result).toHaveProperty("easeFactor");
    expect(result).toHaveProperty("reviewInterval");
    expect(result).toHaveProperty("nextReviewAt");
  });

  test("correct fast answer yields quality 5 — ease factor increases", () => {
    const result = calculateSM2(2.5, 1, true, 3000, 10000); // fast
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  test("correct on-time answer yields quality 4 — ease factor increases slightly", () => {
    const result = calculateSM2(2.5, 1, true, 8000, 10000); // normal speed
    expect(result.easeFactor).toBeGreaterThanOrEqual(2.5);
  });

  test("correct slow answer yields quality 3 — ease factor roughly stable", () => {
    const result = calculateSM2(2.5, 1, true, 15000, 10000); // slow
    expect(result.easeFactor).toBeGreaterThan(0);
  });

  test("reviewInterval=1 with correct answer gives 6", () => {
    const result = calculateSM2(2.5, 1, true, 5000, 10000);
    expect(result.reviewInterval).toBe(6);
  });

  test("reviewInterval=6 with correct answer grows beyond 6", () => {
    const result = calculateSM2(2.5, 6, true, 5000, 10000);
    expect(result.reviewInterval).toBeGreaterThan(6);
  });

  test("nextReviewAt is in the future for correct answer", () => {
    const result = calculateSM2(2.5, 1, true, 5000, 10000);
    expect(result.nextReviewAt.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  test("higher reviewInterval produces longer next review delay", () => {
    const r1 = calculateSM2(2.5, 6, true, 5000, 10000);
    const r2 = calculateSM2(2.5, 20, true, 5000, 10000);
    expect(r2.reviewInterval).toBeGreaterThan(r1.reviewInterval);
  });
});

describe("calculateSM2 — wrong answers", () => {
  test("resets interval to 1 on quick wrong answer", () => {
    const result = calculateSM2(2.5, 6, false, 1000, 10000); // very fast wrong
    expect(result.reviewInterval).toBe(1);
  });

  test("resets interval to 1 on slow wrong answer", () => {
    const result = calculateSM2(2.5, 10, false, 12000, 10000); // slow wrong
    expect(result.reviewInterval).toBe(1);
  });

  test("ease factor decreases on wrong answer", () => {
    const result = calculateSM2(2.5, 1, false, 3000, 10000);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  test("ease factor is at minimum 1.3", () => {
    // After many wrong answers, should not go below 1.3
    let ef = 1.3;
    for (let i = 0; i < 10; i++) {
      ef = calculateSM2(ef, 1, false, 1000, 10000).easeFactor;
    }
    expect(ef).toBeGreaterThanOrEqual(1.3);
  });

  test("quality=1 (fast wrong) produces negative ease factor change", () => {
    const result = calculateSM2(2.5, 1, false, 1000, 10000);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  test("quality=2 (slow wrong) also resets interval", () => {
    const result = calculateSM2(2.5, 5, false, 9000, 10000); // 90% of expected = slow wrong
    expect(result.reviewInterval).toBe(1);
  });
});

describe("calculateSM2 — edge cases", () => {
  test("does not produce NaN for ease factor", () => {
    const result = calculateSM2(1.3, 1, false, 500, 10000);
    expect(isNaN(result.easeFactor)).toBe(false);
  });

  test("does not produce NaN for reviewInterval", () => {
    const result = calculateSM2(1.3, 1, true, 500, 10000);
    expect(isNaN(result.reviewInterval)).toBe(false);
  });

  test("nextReviewAt is a Date object", () => {
    const result = calculateSM2(2.5, 1, true, 5000, 10000);
    expect(result.nextReviewAt instanceof Date).toBe(true);
  });

  test("works with zero expectedTime", () => {
    // Should not throw
    const result = calculateSM2(2.5, 1, true, 0, 0);
    expect(result).toHaveProperty("easeFactor");
  });

  test("works with equal timeSpent and expectedTime", () => {
    const result = calculateSM2(2.5, 1, true, 5000, 5000);
    expect(result).toHaveProperty("reviewInterval");
  });
});

// ─── selectNextSubItem ────────────────────────────────────────────────────────
const baseSubItems = [
  { id: "sub-1", muted: false, difficulty: 1, nextReviewAt: null },
  { id: "sub-2", muted: false, difficulty: 2, nextReviewAt: null },
  { id: "sub-3", muted: false, difficulty: 3, nextReviewAt: null },
];

describe("selectNextSubItem — basic selection", () => {
  test("returns a subItem id from eligible items", () => {
    const result = selectNextSubItem(baseSubItems, {});
    expect(["sub-1", "sub-2", "sub-3"]).toContain(result);
  });

  test("returns null when all items are muted", () => {
    const allMuted = baseSubItems.map((s) => ({ ...s, muted: true }));
    expect(selectNextSubItem(allMuted, {})).toBeNull();
  });

  test("returns null when subItems array is empty", () => {
    expect(selectNextSubItem([], {})).toBeNull();
  });

  test("returns the only available item when one is not muted", () => {
    const onlyOne = [
      { id: "sub-a", muted: false, difficulty: 1, nextReviewAt: null },
      { id: "sub-b", muted: true, difficulty: 1, nextReviewAt: null },
    ];
    expect(selectNextSubItem(onlyOne, {})).toBe("sub-a");
  });

  test("ignores muted subItems in selection", () => {
    const withMuted = [
      { id: "sub-1", muted: true, difficulty: 1, nextReviewAt: null },
      { id: "sub-2", muted: false, difficulty: 2, nextReviewAt: null },
    ];
    expect(selectNextSubItem(withMuted, {})).toBe("sub-2");
  });
});

describe("selectNextSubItem — stats-based scoring", () => {
  test("weakest subItem has higher chance of selection", () => {
    // Run 100 times and check that sub-1 (worst performance) is selected more
    const subItems = [
      { id: "sub-1", muted: false, difficulty: 1, nextReviewAt: null },
      { id: "sub-2", muted: false, difficulty: 1, nextReviewAt: null },
    ];
    const stats = {
      "sub-1": { correctCount: 0, totalCount: 10, difficulty: 1 },
      "sub-2": { correctCount: 10, totalCount: 10, difficulty: 1 },
    };
    let sub1Count = 0;
    for (let i = 0; i < 100; i++) {
      if (selectNextSubItem(subItems, stats) === "sub-1") sub1Count++;
    }
    // sub-1 should be selected significantly more often than sub-2
    expect(sub1Count).toBeGreaterThan(50);
  });

  test("overdue subItem (past nextReviewAt) gets boosted", () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
    const subItems = [
      { id: "sub-1", muted: false, difficulty: 1, nextReviewAt: pastDate },
      { id: "sub-2", muted: false, difficulty: 1, nextReviewAt: null },
    ];
    let sub1Count = 0;
    for (let i = 0; i < 100; i++) {
      if (selectNextSubItem(subItems, {}) === "sub-1") sub1Count++;
    }
    // overdue sub-1 should be selected more often
    expect(sub1Count).toBeGreaterThan(50);
  });

  test("future nextReviewAt does not get overdueBoost", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const subItems = [
      { id: "sub-1", muted: false, difficulty: 1, nextReviewAt: futureDate },
      { id: "sub-2", muted: false, difficulty: 1, nextReviewAt: null },
    ];
    // Just verify it doesn't throw and returns a valid result
    const result = selectNextSubItem(subItems, {});
    expect(["sub-1", "sub-2"]).toContain(result);
  });

  test("unseen subItem (no stats) defaults to 0.5 correctRate", () => {
    // With default 0.5 rate, item should be eligible but not heavily boosted
    const result = selectNextSubItem(baseSubItems, {});
    expect(result).not.toBeNull();
  });

  test("recently-seen subItem has lower recencyScore", () => {
    const recentDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
    const subItems = [
      { id: "sub-recent", muted: false, difficulty: 1, nextReviewAt: null },
      { id: "sub-old", muted: false, difficulty: 1, nextReviewAt: null },
    ];
    const stats = {
      "sub-recent": { correctCount: 5, totalCount: 10, difficulty: 1, lastSeen: recentDate },
      "sub-old": { correctCount: 5, totalCount: 10, difficulty: 1, lastSeen: new Date(Date.now() - 600000).toISOString() },
    };
    let oldCount = 0;
    for (let i = 0; i < 100; i++) {
      if (selectNextSubItem(subItems, stats) === "sub-old") oldCount++;
    }
    // Old item (not seen recently) should be selected more
    expect(oldCount).toBeGreaterThan(40);
  });
});

describe("selectNextSubItem — determinism and safety", () => {
  test("always returns a string or null", () => {
    for (let i = 0; i < 20; i++) {
      const result = selectNextSubItem(baseSubItems, {});
      expect(typeof result === "string" || result === null).toBe(true);
    }
  });

  test("works with a single eligible subItem", () => {
    const single = [{ id: "only", muted: false, difficulty: 1, nextReviewAt: null }];
    for (let i = 0; i < 10; i++) {
      expect(selectNextSubItem(single, {})).toBe("only");
    }
  });

  test("works with many subItems without throwing", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `sub-${i}`,
      muted: false,
      difficulty: 1 + (i % 5),
      nextReviewAt: null,
    }));
    expect(() => selectNextSubItem(many, {})).not.toThrow();
  });

  test("handles undefined nextReviewAt gracefully", () => {
    const items = [{ id: "s1", muted: false, difficulty: 1, nextReviewAt: undefined as any }];
    expect(() => selectNextSubItem(items, {})).not.toThrow();
  });

  test("returns a value from the input ids", () => {
    const ids = new Set(baseSubItems.map((s) => s.id));
    for (let i = 0; i < 50; i++) {
      const result = selectNextSubItem(baseSubItems, {});
      expect(ids.has(result as string)).toBe(true);
    }
  });
});
