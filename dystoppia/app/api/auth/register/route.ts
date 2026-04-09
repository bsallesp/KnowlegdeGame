import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createOtp } from "@/lib/otp";
import { getDevOtp, sendOtpEmail } from "@/lib/email";
import { requestLogger } from "@/lib/logger";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });

    if (existing?.emailVerified) {
      // Don't reveal that email exists — same response shape
      return NextResponse.json({ ok: true });
    }

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: { email: normalized, passwordHash, emailVerified: false },
      });
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
    const log = requestLogger("auth/register"); log.error("Registration failed", { error: String(err) });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
