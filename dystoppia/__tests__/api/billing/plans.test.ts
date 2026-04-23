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

  test("learner plan has price 7.99", async () => {
    const res = await GET();
    const { plans } = await res.json();
    const learner = plans.find((p: { id: string }) => p.id === "learner");
    expect(learner.price).toBe(7.99);
  });

  test("master plan has price 16.99", async () => {
    const res = await GET();
    const { plans } = await res.json();
    const master = plans.find((p: { id: string }) => p.id === "master");
    expect(master.price).toBe(16.99);
  });

  test("each plan has rate limit fields", async () => {
    const res = await GET();
    const { plans } = await res.json();
    for (const plan of plans) {
      expect(typeof plan.hourlyLimit).toBe("number");
      expect(plan.hourlyLimit).toBeGreaterThan(0);
    }
  });

  test("free plan has 5 hourly limit", async () => {
    const free = PLANS.find((p) => p.id === "free")!;
    expect(free.hourlyLimit).toBe(5);
  });

  test("learner plan has 30 hourly limit", async () => {
    const learner = PLANS.find((p) => p.id === "learner")!;
    expect(learner.hourlyLimit).toBe(30);
  });

  test("master plan has 100 hourly limit", async () => {
    const master = PLANS.find((p) => p.id === "master")!;
    expect(master.hourlyLimit).toBe(100);
  });
});
