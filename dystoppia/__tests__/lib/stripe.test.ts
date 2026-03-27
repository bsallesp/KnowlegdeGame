import { describe, test, expect, vi, afterEach } from "vitest";

describe("planFromPriceId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("maps STRIPE_PRICE_* env ids to plan keys", async () => {
    vi.stubEnv("STRIPE_PRICE_LEARNER", "price_learn_x");
    vi.stubEnv("STRIPE_PRICE_MASTER", "price_master_x");
    const { planFromPriceId } = await import("@/lib/stripe");
    expect(planFromPriceId("price_learn_x")).toBe("learner");
    expect(planFromPriceId("price_master_x")).toBe("master");
    expect(planFromPriceId("unknown")).toBeNull();
  });
});

describe("getStripe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("throws when STRIPE_SECRET_KEY is not set", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    const { getStripe } = await import("@/lib/stripe");
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
  });
});
