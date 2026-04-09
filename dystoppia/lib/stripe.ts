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

export interface StripeCreditPackage {
  id: string;
  name: string;
  credits: number;
  unitAmountCents: number;
  description: string;
}

export const CREDIT_PACKAGES: StripeCreditPackage[] = [
  {
    id: "starter_100",
    name: "Starter 100",
    credits: 100,
    unitAmountCents: 1500,
    description: "Best for validating smaller Builder requests.",
  },
  {
    id: "builder_300",
    name: "Builder 300",
    credits: 300,
    unitAmountCents: 3900,
    description: "Balanced package for repeated analysis and planning work.",
  },
  {
    id: "studio_1000",
    name: "Studio 1000",
    credits: 1000,
    unitAmountCents: 9900,
    description: "Lower unit cost for heavier Dystoppia usage.",
  },
];

export function getCreditPackage(packageId: string): StripeCreditPackage | null {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === packageId) ?? null;
}

export function planFromPriceId(priceId: string): string | null {
  for (const [plan, id] of Object.entries(STRIPE_PLAN_PRICES)) {
    if (id === priceId) return plan;
  }
  return null;
}
