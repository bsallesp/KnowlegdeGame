import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authorization";
import { adjustCredits } from "@/lib/credits";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, "master");
    if (auth instanceof NextResponse) return auth;

    const { userId, amount, reason } = await req.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount === 0) {
      return NextResponse.json({ error: "amount must be a non-zero integer" }, { status: 400 });
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const entry = await adjustCredits({
      userId,
      amount,
      reason: reason.trim(),
      actorUserId: auth.userId,
      actorRole: auth.role,
      metadata: {
        source: "admin_adjust_route",
      },
    });

    return NextResponse.json({
      ok: true,
      entry,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to adjust credits", details: String(error) },
      { status: 500 }
    );
  }
}
