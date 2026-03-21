import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── bcryptjs mock ────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
    compare: vi.fn(),
  },
}));

// ─── OTP mock ─────────────────────────────────────────────────────────────────
const mockCreateOtp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/otp", () => ({ createOtp: mockCreateOtp }));

// ─── Email mock ───────────────────────────────────────────────────────────────
const mockSendOtpEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendOtpEmail: mockSendOtpEmail }));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCreate     = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique, create: mockCreate } },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { POST } from "@/app/api/auth/register/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOtp.mockResolvedValue("123456");
  mockSendOtpEmail.mockResolvedValue(undefined);
  mockFindUnique.mockResolvedValue(null);
  mockCreate.mockResolvedValue({ id: "u1", email: "test@example.com" });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe("POST /api/auth/register — validation", () => {
  test("returns 400 when email is missing", async () => {
    const res = await POST(req({ password: "secret123" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid email format", async () => {
    const res = await POST(req({ email: "notanemail", password: "secret123" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid email/i);
  });

  test("returns 400 when password is missing", async () => {
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when password is too short", async () => {
    const res = await POST(req({ email: "user@test.com", password: "abc" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/8 characters/i);
  });
});

// ─── Existing user (anti-enumeration) ─────────────────────────────────────────

describe("POST /api/auth/register — existing user", () => {
  test("returns 200 even when email already registered (anti-enumeration)", async () => {
    mockFindUnique.mockResolvedValue({ id: "u-existing", email: "exists@test.com" });
    const res = await POST(req({ email: "exists@test.com", password: "password123" }));
    expect(res.status).toBe(200);
  });

  test("does NOT create a new user when email already exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "u-existing", email: "exists@test.com" });
    await POST(req({ email: "exists@test.com", password: "password123" }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("does NOT send OTP when email already exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "u-existing", email: "exists@test.com" });
    await POST(req({ email: "exists@test.com", password: "password123" }));
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("POST /api/auth/register — new user", () => {
  test("returns 200 with ok: true on success", async () => {
    const res = await POST(req({ email: "new@test.com", password: "password123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test("creates user with bcrypt-hashed password", async () => {
    await POST(req({ email: "new@test.com", password: "password123" }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "$2a$12$hashedpassword",
          emailVerified: false,
        }),
      })
    );
  });

  test("normalizes email to lowercase", async () => {
    await POST(req({ email: "NEW@TEST.COM", password: "password123" }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "new@test.com" }) })
    );
  });

  test("creates OTP of type VERIFY_EMAIL", async () => {
    await POST(req({ email: "new@test.com", password: "password123" }));
    expect(mockCreateOtp).toHaveBeenCalledWith("new@test.com", "VERIFY_EMAIL");
  });

  test("sends OTP email after creating user", async () => {
    await POST(req({ email: "new@test.com", password: "password123" }));
    expect(mockSendOtpEmail).toHaveBeenCalledWith("new@test.com", "123456", "VERIFY_EMAIL");
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe("POST /api/auth/register — rate limiting", () => {
  test("returns 429 when createOtp throws TOO_MANY_REQUESTS", async () => {
    mockCreateOtp.mockRejectedValue(new Error("TOO_MANY_REQUESTS"));
    const res = await POST(req({ email: "new@test.com", password: "password123" }));
    expect(res.status).toBe(429);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("POST /api/auth/register — error handling", () => {
  test("returns 500 when DB throws unexpectedly", async () => {
    mockCreate.mockRejectedValue(new Error("DB connection lost"));
    const res = await POST(req({ email: "new@test.com", password: "password123" }));
    expect(res.status).toBe(500);
  });

  test("does not leak internal error details to client", async () => {
    mockCreate.mockRejectedValue(new Error("internal db secret"));
    const res = await POST(req({ email: "new@test.com", password: "password123" }));
    const data = await res.json();
    expect(data.error).not.toContain("internal db secret");
  });
});
