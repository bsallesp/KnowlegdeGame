import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 3; // max OTPs per email per window

export type OtpType = "VERIFY_EMAIL" | "RESET_PASSWORD";

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Returns the plain code (send to user), stores the hash. */
export async function createOtp(email: string, type: OtpType): Promise<string> {
  // Rate limit: count recent OTPs for this email+type
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await prisma.otpCode.count({
    where: { email, type, createdAt: { gte: since } },
  });
  if (recent >= RATE_LIMIT_MAX) {
    throw new Error("TOO_MANY_REQUESTS");
  }

  const code = generateOtp();
  await prisma.otpCode.create({
    data: {
      email,
      codeHash: hashOtp(code),
      type,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  return code;
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "USED" | "MAX_ATTEMPTS" | "INVALID" };

/** Validates and consumes the OTP. */
export async function verifyOtp(email: string, code: string, type: OtpType): Promise<VerifyOtpResult> {
  const otp = await prisma.otpCode.findFirst({
    where: { email, type },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { ok: false, reason: "NOT_FOUND" };
  if (otp.usedAt) return { ok: false, reason: "USED" };
  if (otp.expiresAt < new Date()) return { ok: false, reason: "EXPIRED" };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "MAX_ATTEMPTS" };

  const valid = otp.codeHash === hashOtp(code);

  if (!valid) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "INVALID" };
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return { ok: true };
}
