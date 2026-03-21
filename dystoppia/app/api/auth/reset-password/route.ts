import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { sign } from "@/lib/cookieToken";
import { requestLogger } from "@/lib/logger";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  try {
    const { email, code, password } = await req.json();

    if (!email || !code || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const result = await verifyOtp(normalized, String(code).trim(), "RESET_PASSWORD");

    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "No reset code found. Please request a new one.",
        EXPIRED: "Code expired. Request a new one.",
        USED: "Code already used.",
        MAX_ATTEMPTS: "Too many incorrect attempts. Request a new code.",
        INVALID: "Incorrect code. Try again.",
      };
      return NextResponse.json(
        { error: messages[result.reason] ?? "Reset failed." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({
      where: { email: normalized },
      data: { passwordHash },
    });

    // Log user in immediately after reset
    const cookieStore = await cookies();
    cookieStore.set("dystoppia_uid", sign(user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (err) {
    const log = requestLogger("auth/reset-password"); log.error("Reset failed", { error: String(err) });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
