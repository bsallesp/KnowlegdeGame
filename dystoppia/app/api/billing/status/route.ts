import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";

const PLAN_LIMITS: Record<string, { hourly: number; weekly: number }> = {
  free: { hourly: 5, weekly: 30 },
  learner: { hourly: 30, weekly: 250 },
  master: { hourly: 100, weekly: 1000 },
};

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
        weeklyUsage: true,
        weeklyWindowStart: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS["free"];

    const hourlyExpired = now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
    const weeklyExpired = now.getTime() - user.weeklyWindowStart.getTime() >= WEEK_MS;

    const hourlyUsage = hourlyExpired ? 0 : user.hourlyUsage;
    const weeklyUsage = weeklyExpired ? 0 : user.weeklyUsage;

    return NextResponse.json({
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      hourlyUsage,
      hourlyRemaining: limits.hourly - hourlyUsage,
      hourlyResetsAt: new Date(user.hourlyWindowStart.getTime() + HOUR_MS).toISOString(),
      weeklyUsage,
      weeklyRemaining: limits.weekly - weeklyUsage,
      weeklyResetsAt: new Date(user.weeklyWindowStart.getTime() + WEEK_MS).toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get billing status", details: String(error) },
      { status: 500 }
    );
  }
}
