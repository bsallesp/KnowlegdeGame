import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOtp } from "@/lib/otp";
import { getDevOtp, sendOtpEmail } from "@/lib/email";
import { requestLogger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

    const normalized = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });

    // Always return ok — don't reveal whether email exists
    if (!user || user.emailVerified) {
      return NextResponse.json({ ok: true });
    }

    let code: string;
    try {
      code = await createOtp(normalized, "VERIFY_EMAIL");
    } catch {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const devCode = getDevOtp(code);
    if (!devCode) {
      await sendOtpEmail(normalized, code, "VERIFY_EMAIL");
    }

    return NextResponse.json({ ok: true, devCode });
  } catch (err) {
    const log = requestLogger("auth/resend-verification"); log.error("Failed to resend", { error: String(err) });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
