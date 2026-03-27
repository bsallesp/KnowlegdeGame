import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  }
  return _stripe;
}

// Convenience alias used in routes
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const STRIPE_PLAN_PRICES: Record<string, string | undefined> = {
  learner: process.env.STRIPE_PRICE_LEARNER,
  master: process.env.STRIPE_PRICE_MASTER,
};

export function planFromPriceId(priceId: string): string | null {
  for (const [plan, id] of Object.entries(STRIPE_PLAN_PRICES)) {
    if (id === priceId) return plan;
  }
  return null;
}
