import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import { planLimit } from "@/lib/credits";
import { PLANS } from "@/app/api/billing/plans/route";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { plan } = body ?? {};

    const validPlan = PLANS.find((p) => p.id === plan);
    if (!validPlan) {
      return NextResponse.json(
        { error: "Invalid plan. Must be one of: free, learner, master" },
        { status: 400 }
      );
    }

    const resetAt = new Date();
    resetAt.setMonth(resetAt.getMonth() + 1);

    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: {
        plan,
        credits: planLimit(plan),
        creditsResetsAt: resetAt,
      },
      select: { id: true, plan: true, credits: true, creditsResetsAt: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Purchase failed", details: String(error) },
      { status: 500 }
    );
  }
}
