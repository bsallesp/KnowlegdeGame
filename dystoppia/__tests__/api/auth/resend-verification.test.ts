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

import { POST } from "@/app/api/auth/resend-verification/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOtp.mockResolvedValue("654321");
  mockSendOtpEmail.mockResolvedValue(undefined);
  mockFindUnique.mockResolvedValue({ id: "u1", email: "user@test.com", emailVerified: false });
});

describe("POST /api/auth/resend-verification", () => {
  test("returns 400 when email is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  test("returns 200 even when user does not exist (anti-enumeration)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(req({ email: "ghost@test.com" }));
    expect(res.status).toBe(200);
  });

  test("does NOT send email when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    await POST(req({ email: "ghost@test.com" }));
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  test("returns 200 even when email is already verified (anti-enumeration)", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", email: "user@test.com", emailVerified: true });
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(200);
  });

  test("does NOT resend when email is already verified", async () => {
    mockFindUnique.mockResolvedValue({ id: "u1", email: "user@test.com", emailVerified: true });
    await POST(req({ email: "user@test.com" }));
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  test("sends OTP for unverified user", async () => {
    await POST(req({ email: "user@test.com" }));
    expect(mockSendOtpEmail).toHaveBeenCalledWith("user@test.com", "654321", "VERIFY_EMAIL");
  });

  test("returns 429 when rate limit is hit", async () => {
    mockCreateOtp.mockRejectedValue(new Error("TOO_MANY_REQUESTS"));
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(429);
  });

  test("returns 500 when sendOtpEmail throws", async () => {
    mockSendOtpEmail.mockRejectedValue(new Error("SMTP down"));
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Something went wrong");
  });
});
