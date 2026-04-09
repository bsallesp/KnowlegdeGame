import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sign } from "@/lib/cookieToken";
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Legacy user bootstrap is disabled in production. Use the authenticated auth flow." },
        { status: 403 }
      );
    }

    const { email, sessionId } = await req.json();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    const isNew = !existing;

    const user = existing ?? await prisma.user.create({ data: { email: normalized } });

    // Backfill anonymous answers to this user
    if (sessionId) {
      await prisma.userAnswer.updateMany({
        where: { sessionId, userId: null },
        data: { userId: user.id },
      });
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sign(user.id), getSessionCookieOptions());

    return NextResponse.json({ id: user.id, email: user.email, isNew });
  } catch (error) {
    logger.error("users", "Failed to create user", { error: String(error) });
    return NextResponse.json(
      { error: "Failed to create user", details: String(error) },
      { status: 500 }
    );
  }
}
