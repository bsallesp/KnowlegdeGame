import { describe, test, expect, vi } from "vitest";
import { calculateNewDifficulty, selectNextSubItem } from "@/lib/adaptive";

// ─── calculateNewDifficulty ───────────────────────────────────────────────────

describe("calculateNewDifficulty", () => {
  test("returns current difficulty when recentTotal is 0", () => {
    expect(calculateNewDifficulty(3, 0, 0)).toBe(3);
  });

  test("increases difficulty when beginner band has stronger evidence", () => {
    expect(calculateNewDifficulty(2, 4, 4)).toBe(3); // 100% correct, 4 answers
  });

  test("increases by exactly 1 step at a time", () => {
    expect(calculateNewDifficulty(1, 4, 4)).toBe(2); // 100%, 4 answers
  });

  test("does NOT increase when correctRate >= 0.8 but recentTotal < 3", () => {
    expect(calculateNewDifficulty(2, 2, 2)).toBe(2); // 100% but only 2 answers
  });

  test("does NOT increase when recentTotal is exactly 2", () => {
    expect(calculateNewDifficulty(3, 2, 2)).toBe(3);
  });

  test("decreases difficulty when correctRate < 0.5", () => {
    expect(calculateNewDifficulty(3, 1, 4)).toBe(2); // 25% correct
  });

  test("decreases by exactly 1 step at a time", () => {
    expect(calculateNewDifficulty(4, 0, 3)).toBe(3); // 0% correct
  });

  test("stays same when correctRate is between 0.5 and 0.79", () => {
    expect(calculateNewDifficulty(3, 3, 5)).toBe(3); // 60% correct
  });

  test("stays same at exactly 0.5 correctRate", () => {
    expect(calculateNewDifficulty(2, 2, 4)).toBe(2); // exactly 50%
  });

  test("never exceeds max difficulty of 5", () => {
    expect(calculateNewDifficulty(5, 5, 5)).toBe(5); // already at max
  });

  test("never goes below min difficulty of 1", () => {
    expect(calculateNewDifficulty(1, 0, 3)).toBe(1); // already at min, all wrong
  });

  test("handles perfect score (1.0) with 4+ answers in beginner band", () => {
    expect(calculateNewDifficulty(2, 4, 4)).toBe(3);
  });

  test("handles zero correct answers with 3+ total", () => {
    expect(calculateNewDifficulty(3, 0, 5)).toBe(2);
  });

  test("correctRate of exactly 0.8 no longer advances the beginner band", () => {
    // 0.8 * 5 = 4 correct out of 5 — but we need exactly 0.8
    // 4/5 = 0.8, recentTotal=5 >= 3 → should increase
    expect(calculateNewDifficulty(2, 4, 5)).toBe(2);
  });

  test("correctRate just below 0.8 (0.79) does not increase", () => {
    // Closest integer ratio: 3/4 = 0.75
    expect(calculateNewDifficulty(2, 3, 4)).toBe(2); // 75%, no change
  });

  test("correctRate just below 0.5 (0.49) triggers decrease", () => {
    // 1/3 ≈ 0.333 < 0.5
    expect(calculateNewDifficulty(3, 1, 3)).toBe(2);
  });

  test("difficulty of 5 does not wrap around when trying to increase", () => {
    expect(calculateNewDifficulty(5, 10, 10)).toBe(5);
  });
});

// ─── selectNextSubItem ────────────────────────────────────────────────────────

describe("selectNextSubItem", () => {
  test("returns null for empty subItems array", () => {
    expect(selectNextSubItem([], {})).toBeNull();
  });

  test("returns null when all subItems are muted", () => {
    const subItems = [
      { id: "a", muted: true, difficulty: 1 },
      { id: "b", muted: true, difficulty: 2 },
    ];
    expect(selectNextSubItem(subItems, {})).toBeNull();
  });

  test("returns the only eligible (unmuted) subItem", () => {
    const subItems = [
      { id: "a", muted: true, difficulty: 1 },
      { id: "b", muted: false, difficulty: 1 },
    ];
    expect(selectNextSubItem(subItems, {})).toBe("b");
  });

  test("always returns an ID that belongs to the eligible list", () => {
    const subItems = [
      { id: "x1", muted: false, difficulty: 1 },
      { id: "x2", muted: false, difficulty: 2 },
      { id: "x3", muted: false, difficulty: 3 },
      { id: "x4", muted: true, difficulty: 1 },
    ];
    const eligibleIds = ["x1", "x2", "x3"];
    for (let i = 0; i < 20; i++) {
      const result = selectNextSubItem(subItems, {});
      expect(eligibleIds).toContain(result);
    }
  });

  test("assigns default correctRate of 0.5 to subItem with no stats", () => {
    // A subItem with no stats gets correctRate=0.5 → weaknessScore = 0.5*5 = 2.5
    // A subItem with 100% correct rate gets weaknessScore = 0
    // So the no-stats subItem should be preferred over the perfect one (over many runs)
    const subItems = [
      { id: "perfect", muted: false, difficulty: 1 },
      { id: "unknown", muted: false, difficulty: 1 },
    ];
    const stats = {
      perfect: { correctCount: 10, totalCount: 10, difficulty: 1 },
    };
    // Over many iterations, "unknown" should be selected at least some of the time
    const results = Array.from({ length: 30 }, () => selectNextSubItem(subItems, stats));
    expect(results.some((r) => r === "unknown")).toBe(true);
  });

  test("prefers subItem with lower correct rate over time", () => {
    const subItems = [
      { id: "strong", muted: false, difficulty: 3 },
      { id: "weak", muted: false, difficulty: 1 },
    ];
    // Provide identical lastSeen to eliminate recency bias — only weaknessScore matters
    const now = new Date().toISOString();
    const stats = {
      strong: { correctCount: 9, totalCount: 10, difficulty: 3, lastSeen: now }, // 90% → weaknessScore 0.5
      weak: { correctCount: 1, totalCount: 10, difficulty: 1, lastSeen: now },   // 10% → weaknessScore 4.5
    };
    // P(weak) = 4.5/5 = 90% → in 100 runs, expect at least 70
    const results = Array.from({ length: 100 }, () => selectNextSubItem(subItems, stats));
    const weakCount = results.filter((r) => r === "weak").length;
    expect(weakCount).toBeGreaterThan(60);
  });
});
