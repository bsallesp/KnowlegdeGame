import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── OTP mock ─────────────────────────────────────────────────────────────────
const mockVerifyOtp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/otp", () => ({ verifyOtp: mockVerifyOtp }));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockUpdate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: mockUpdate } },
}));

// ─── Cookie mock ──────────────────────────────────────────────────────────────
const mockSet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: mockSet }),
}));

vi.mock("@/lib/cookieToken", () => ({ sign: vi.fn().mockReturnValue("signed-token") }));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { POST } from "@/app/api/auth/verify-email/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyOtp.mockResolvedValue({ ok: true });
  mockUpdate.mockResolvedValue({ id: "u1", email: "user@test.com" });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("POST /api/auth/verify-email — validation", () => {
  test("returns 400 when email is missing", async () => {
    const res = await POST(req({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when code is missing", async () => {
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(400);
  });
});

// ─── OTP failures ─────────────────────────────────────────────────────────────

describe("POST /api/auth/verify-email — OTP failures", () => {
  const cases: Array<{ reason: string; errorMatch: RegExp }> = [
    { reason: "NOT_FOUND",    errorMatch: /register again/i },
    { reason: "EXPIRED",      errorMatch: /expired/i },
    { reason: "USED",         errorMatch: /already used/i },
    { reason: "MAX_ATTEMPTS", errorMatch: /too many/i },
    { reason: "INVALID",      errorMatch: /incorrect/i },
  ];

  for (const { reason, errorMatch } of cases) {
    test(`returns 400 with message for reason: ${reason}`, async () => {
      mockVerifyOtp.mockResolvedValue({ ok: false, reason });
      const res = await POST(req({ email: "user@test.com", code: "000000" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(errorMatch);
    });
  }

  test("does NOT activate user when OTP is invalid", async () => {
    mockVerifyOtp.mockResolvedValue({ ok: false, reason: "INVALID" });
    await POST(req({ email: "user@test.com", code: "000000" }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("POST /api/auth/verify-email — success", () => {
  test("returns 200 with user id and email", async () => {
    const res = await POST(req({ email: "user@test.com", code: "123456" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("u1");
    expect(data.email).toBe("user@test.com");
  });

  test("marks emailVerified as true in DB", async () => {
    await POST(req({ email: "user@test.com", code: "123456" }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailVerified: true } })
    );
  });

  test("sets session cookie after verification", async () => {
    await POST(req({ email: "user@test.com", code: "123456" }));
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "signed-token",
      expect.objectContaining({ httpOnly: true })
    );
  });

  test("passes VERIFY_EMAIL type to verifyOtp", async () => {
    await POST(req({ email: "user@test.com", code: "123456" }));
    expect(mockVerifyOtp).toHaveBeenCalledWith("user@test.com", "123456", "VERIFY_EMAIL");
  });

  test("normalizes email to lowercase", async () => {
    await POST(req({ email: "USER@TEST.COM", code: "123456" }));
    expect(mockVerifyOtp).toHaveBeenCalledWith("user@test.com", "123456", "VERIFY_EMAIL");
  });

  test("trims whitespace from code", async () => {
    await POST(req({ email: "user@test.com", code: "  123456  " }));
    expect(mockVerifyOtp).toHaveBeenCalledWith("user@test.com", "123456", "VERIFY_EMAIL");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("POST /api/auth/verify-email — error handling", () => {
  test("returns 500 when DB update throws", async () => {
    mockUpdate.mockRejectedValue(new Error("DB error"));
    const res = await POST(req({ email: "user@test.com", code: "123456" }));
    expect(res.status).toBe(500);
  });
});
