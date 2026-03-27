import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verify } from "@/lib/cookieToken";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("dystoppia_uid")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = verify(token);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        hourlyUsage: true,
        hourlyWindowStart: true,
        weeklyUsage: true,
        weeklyWindowStart: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    const PLAN_LIMITS: Record<string, { hourly: number; weekly: number }> = {
      free: { hourly: 5, weekly: 30 },
      learner: { hourly: 30, weekly: 250 },
      master: { hourly: 100, weekly: 1000 },
    };
    const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS["free"];

    const now = new Date();
    const HOUR_MS = 60 * 60 * 1000;
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const hourlyExpired = now.getTime() - user.hourlyWindowStart.getTime() >= HOUR_MS;
    const weeklyExpired = now.getTime() - user.weeklyWindowStart.getTime() >= WEEK_MS;

    const hourlyUsage = hourlyExpired ? 0 : user.hourlyUsage;
    const weeklyUsage = weeklyExpired ? 0 : user.weeklyUsage;

    return NextResponse.json({
      id: user.id,
      email: user.email,
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
      { error: "Failed to verify session", details: String(error) },
      { status: 500 }
    );
  }
}
