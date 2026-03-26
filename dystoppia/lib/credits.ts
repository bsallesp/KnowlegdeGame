import { prisma } from "@/lib/prisma";

export const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  learner: 500,
  master: 2000,
};

export function planLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS["free"];
}

export class CreditError extends Error {
  constructor(public readonly remaining: number) {
    super("Insufficient credits");
    this.name = "CreditError";
  }
}

const MAX_DEDUCT_RETRIES = 5;

// Deducts `amount` credits from the user. Performs a lazy monthly reset first
// if creditsResetsAt has passed. Returns remaining credits after deduction.
// Throws CreditError if the user has insufficient credits.
export async function deductCredits(userId: string, amount: number): Promise<number> {
  for (let attempt = 0; attempt < MAX_DEDUCT_RETRIES; attempt++) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, creditsResetsAt: true, plan: true },
    });

    if (!user) throw new Error("User not found");

    const now = new Date();
    const shouldReset = now >= user.creditsResetsAt;
    const availableCredits = shouldReset ? planLimit(user.plan) : user.credits;

    if (availableCredits < amount) {
      throw new CreditError(availableCredits);
    }

    const remaining = availableCredits - amount;
    const data: { credits: number; creditsResetsAt?: Date } = { credits: remaining };

    if (shouldReset) {
      const next = new Date(user.creditsResetsAt);
      next.setMonth(next.getMonth() + 1);
      data.creditsResetsAt = next;
    }

    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        credits: user.credits,
        creditsResetsAt: user.creditsResetsAt,
      },
      data,
    });

    if (result.count === 1) {
      return remaining;
    }
  }

  throw new Error("Failed to deduct credits due to concurrent updates");
}
