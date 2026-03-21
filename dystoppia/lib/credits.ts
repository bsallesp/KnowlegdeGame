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

// Deducts `amount` credits from the user. Performs a lazy monthly reset first
// if creditsResetsAt has passed. Returns remaining credits after deduction.
// Throws CreditError if the user has insufficient credits.
export async function deductCredits(userId: string, amount: number): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, creditsResetsAt: true, plan: true },
  });

  if (!user) throw new Error("User not found");

  let credits = user.credits;
  const updateData: { credits?: number; creditsResetsAt?: Date } = {};

  // Lazy monthly reset
  if (new Date() >= user.creditsResetsAt) {
    credits = planLimit(user.plan);
    const next = new Date(user.creditsResetsAt);
    next.setMonth(next.getMonth() + 1);
    updateData.creditsResetsAt = next;
  }

  if (credits < amount) throw new CreditError(credits);

  const remaining = credits - amount;
  await prisma.user.update({
    where: { id: userId },
    data: { ...updateData, credits: remaining },
  });

  return remaining;
}
