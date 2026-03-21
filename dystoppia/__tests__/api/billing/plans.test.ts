import { describe, test, expect } from "vitest";
import { GET, PLANS } from "@/app/api/billing/plans/route";

describe("GET /api/billing/plans", () => {
  test("returns 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  test("returns a plans array", async () => {
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.plans)).toBe(true);
  });

  test("includes free, learner, and master plans", async () => {
    const res = await GET();
    const { plans } = await res.json();
    const ids = plans.map((p: { id: string }) => p.id);
    expect(ids).toContain("free");
    expect(ids).toContain("learner");
    expect(ids).toContain("master");
  });

  test("free plan has price 0", async () => {
    const res = await GET();
    const { plans } = await res.json();
    const free = plans.find((p: { id: string }) => p.id === "free");
    expect(free.price).toBe(0);
  });

  test("learner plan has price 4.99", async () => {
    const res = await GET();
    const { plans } = await res.json();
    const learner = plans.find((p: { id: string }) => p.id === "learner");
    expect(learner.price).toBe(4.99);
  });

  test("master plan has price 9.99", async () => {
    const res = await GET();
    const { plans } = await res.json();
    const master = plans.find((p: { id: string }) => p.id === "master");
    expect(master.price).toBe(9.99);
  });

  test("each plan has questionsPerMonth field", async () => {
    const res = await GET();
    const { plans } = await res.json();
    for (const plan of plans) {
      expect(typeof plan.questionsPerMonth).toBe("number");
      expect(plan.questionsPerMonth).toBeGreaterThan(0);
    }
  });

  test("free plan has 50 questions/month", async () => {
    const free = PLANS.find((p) => p.id === "free")!;
    expect(free.questionsPerMonth).toBe(50);
  });

  test("learner plan has 500 questions/month", async () => {
    const learner = PLANS.find((p) => p.id === "learner")!;
    expect(learner.questionsPerMonth).toBe(500);
  });

  test("master plan has 2000 questions/month", async () => {
    const master = PLANS.find((p) => p.id === "master")!;
    expect(master.questionsPerMonth).toBe(2000);
  });
});
