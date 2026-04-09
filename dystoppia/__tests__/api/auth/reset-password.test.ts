import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── bcryptjs mock ────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("$2a$12$newhash"), compare: vi.fn() },
}));

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
import { POST } from "@/app/api/auth/reset-password/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/reset-password", {
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

describe("POST /api/auth/reset-password — validation", () => {
  test("returns 400 when email is missing", async () => {
    const res = await POST(req({ code: "123456", password: "newpassword1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when code is missing", async () => {
    const res = await POST(req({ email: "user@test.com", password: "newpassword1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when password is missing", async () => {
    const res = await POST(req({ email: "user@test.com", code: "123456" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when password is too short", async () => {
    const res = await POST(req({ email: "user@test.com", code: "123456", password: "short" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/8 characters/i);
  });
});

// ─── OTP failures ─────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password — OTP failures", () => {
  const cases: Array<{ reason: string; errorMatch: RegExp }> = [
    { reason: "NOT_FOUND",    errorMatch: /new one/i },
    { reason: "EXPIRED",      errorMatch: /expired/i },
    { reason: "USED",         errorMatch: /already used/i },
    { reason: "MAX_ATTEMPTS", errorMatch: /too many/i },
    { reason: "INVALID",      errorMatch: /incorrect/i },
  ];

  for (const { reason, errorMatch } of cases) {
    test(`returns 400 with message for reason: ${reason}`, async () => {
      mockVerifyOtp.mockResolvedValue({ ok: false, reason });
      const res = await POST(req({ email: "user@test.com", code: "000000", password: "newpassword1" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(errorMatch);
    });
  }

  test("does NOT update password when OTP fails", async () => {
    mockVerifyOtp.mockResolvedValue({ ok: false, reason: "INVALID" });
    await POST(req({ email: "user@test.com", code: "bad", password: "newpassword1" }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password — success", () => {
  test("returns 200 with user id and email", async () => {
    const res = await POST(req({ email: "user@test.com", code: "123456", password: "newpassword1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("u1");
  });

  test("updates passwordHash in DB with bcrypt hash", async () => {
    await POST(req({ email: "user@test.com", code: "123456", password: "newpassword1" }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { passwordHash: "$2a$12$newhash" } })
    );
  });

  test("logs user in by setting session cookie", async () => {
    await POST(req({ email: "user@test.com", code: "123456", password: "newpassword1" }));
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "signed-token",
      expect.objectContaining({ httpOnly: true })
    );
  });

  test("passes RESET_PASSWORD type to verifyOtp", async () => {
    await POST(req({ email: "user@test.com", code: "123456", password: "newpassword1" }));
    expect(mockVerifyOtp).toHaveBeenCalledWith("user@test.com", "123456", "RESET_PASSWORD");
  });

  test("sets secure cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await POST(req({ email: "user@test.com", code: "123456", password: "newpassword1" }));

    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "signed-token",
      expect.objectContaining({ secure: true })
    );

    vi.unstubAllEnvs();
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password — error handling", () => {
  test("returns 500 when DB throws", async () => {
    mockUpdate.mockRejectedValue(new Error("DB error"));
    const res = await POST(req({ email: "user@test.com", code: "123456", password: "newpassword1" }));
    expect(res.status).toBe(500);
  });
});
