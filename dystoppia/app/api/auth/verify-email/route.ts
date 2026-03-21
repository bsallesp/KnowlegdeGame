import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { sign } from "@/lib/cookieToken";
import { requestLogger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();
    const result = await verifyOtp(normalized, String(code).trim(), "VERIFY_EMAIL");

    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "No verification code found. Please register again.",
        EXPIRED: "Code expired. Request a new one.",
        USED: "Code already used.",
        MAX_ATTEMPTS: "Too many incorrect attempts. Request a new code.",
        INVALID: "Incorrect code. Try again.",
      };
      return NextResponse.json(
        { error: messages[result.reason] ?? "Verification failed." },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { email: normalized },
      data: { emailVerified: true },
    });

    const cookieStore = await cookies();
    cookieStore.set("dystoppia_uid", sign(user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (err) {
    const log = requestLogger("auth/verify-email"); log.error("Verification failed", { error: String(err) });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
