import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import { getCurrentCreditBalance } from "@/lib/credits";
import { CREDIT_PACKAGES } from "@/lib/stripe";

const PLAN_LIMITS: Record<string, { hourly: number }> = {
  free: { hourly: 999999 },
  learner: { hourly: 999999 },
  master: { hourly: 999999 },
};

const HOUR_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        plan: true,
        subscriptionStatus: true,
        hourlyUsage: true,
        hourlyWindowStart: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
    const creditBalance = await getCurrentCreditBalance(auth.userId);
    const hourlyExpired = now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
    const hourlyUsage = hourlyExpired ? 0 : user.hourlyUsage;

    return NextResponse.json({
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      hourlyUsage,
      hourlyRemaining: limits.hourly - hourlyUsage,
      hourlyResetsAt: new Date(user.hourlyWindowStart.getTime() + HOUR_MS).toISOString(),
      creditBalance,
      creditPackages: CREDIT_PACKAGES.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        credits: pkg.credits,
        unitAmountCents: pkg.unitAmountCents,
        description: pkg.description,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get billing status", details: String(error) },
      { status: 500 }
    );
  }
}
