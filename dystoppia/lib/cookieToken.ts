import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.COOKIE_SECRET ?? "dev-secret-change-in-prod";

// Token format: "<userId>.<first-32-hex-chars-of-HMAC-SHA256>"
export function sign(userId: string): string {
  const mac = createHmac("sha256", SECRET)
    .update(userId)
    .digest("hex")
    .slice(0, 32);
  return `${userId}.${mac}`;
}

export function verify(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const userId = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!userId || mac.length !== 32) return null;
  const expected = createHmac("sha256", SECRET)
    .update(userId)
    .digest("hex")
    .slice(0, 32);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
