import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/email";
import { requestLogger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ ok: true }); // anti-enumeration: always ok

    const normalized = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });

    // Always respond ok — never reveal whether the email exists
    if (!user || !user.emailVerified) {
      return NextResponse.json({ ok: true });
    }

    let code: string;
    try {
      code = await createOtp(normalized, "RESET_PASSWORD");
    } catch {
      // Rate limited — still return ok to avoid enumeration
      return NextResponse.json({ ok: true });
    }

    await sendOtpEmail(normalized, code, "RESET_PASSWORD");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const log = requestLogger("auth/forgot-password"); log.error("Failed to send reset OTP", { error: String(err) });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
