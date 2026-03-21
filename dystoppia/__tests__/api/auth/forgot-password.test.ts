import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateOtp    = vi.hoisted(() => vi.fn());
const mockSendOtpEmail = vi.hoisted(() => vi.fn());
const mockFindUnique   = vi.hoisted(() => vi.fn());

vi.mock("@/lib/otp",   () => ({ createOtp: mockCreateOtp }));
vi.mock("@/lib/email", () => ({ sendOtpEmail: mockSendOtpEmail }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));

import { POST } from "@/app/api/auth/forgot-password/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VERIFIED_USER = { id: "u1", email: "user@test.com", emailVerified: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOtp.mockResolvedValue("111222");
  mockSendOtpEmail.mockResolvedValue(undefined);
  mockFindUnique.mockResolvedValue(VERIFIED_USER);
});

describe("POST /api/auth/forgot-password — anti-enumeration", () => {
  test("always returns 200 even when email is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
  });

  test("always returns 200 when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(req({ email: "ghost@test.com" }));
    expect(res.status).toBe(200);
  });

  test("does NOT send email when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    await POST(req({ email: "ghost@test.com" }));
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  test("always returns 200 when email is not verified", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(200);
  });

  test("does NOT send email when user is not verified", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
    await POST(req({ email: "user@test.com" }));
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  test("always returns ok: true regardless of outcome", async () => {
    const res = await POST(req({ email: "anything@test.com" }));
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe("POST /api/auth/forgot-password — happy path", () => {
  test("sends OTP of type RESET_PASSWORD to verified user", async () => {
    await POST(req({ email: "user@test.com" }));
    expect(mockSendOtpEmail).toHaveBeenCalledWith("user@test.com", "111222", "RESET_PASSWORD");
  });

  test("creates OTP of type RESET_PASSWORD", async () => {
    await POST(req({ email: "user@test.com" }));
    expect(mockCreateOtp).toHaveBeenCalledWith("user@test.com", "RESET_PASSWORD");
  });

  test("still returns 200 when rate limited (anti-enumeration)", async () => {
    mockCreateOtp.mockRejectedValue(new Error("TOO_MANY_REQUESTS"));
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(200);
  });
});
