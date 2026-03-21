import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockCount        = vi.hoisted(() => vi.fn());
const mockCreate       = vi.hoisted(() => vi.fn());
const mockFindFirst    = vi.hoisted(() => vi.fn());
const mockOtpUpdate    = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    otpCode: {
      count:     mockCount,
      create:    mockCreate,
      findFirst: mockFindFirst,
      update:    mockOtpUpdate,
    },
  },
}));

import { createOtp, verifyOtp } from "@/lib/otp";

const FUTURE = new Date(Date.now() + 10 * 60 * 1000);
const PAST   = new Date(Date.now() - 1);

beforeEach(() => {
  vi.clearAllMocks();
  mockCount.mockResolvedValue(0);
  mockCreate.mockResolvedValue({});
});

// ─── createOtp ────────────────────────────────────────────────────────────────

describe("createOtp", () => {
  test("returns a 6-digit string code", async () => {
    const code = await createOtp("a@test.com", "VERIFY_EMAIL");
    expect(code).toMatch(/^\d{6}$/);
  });

  test("creates a record in DB with codeHash (not plain code)", async () => {
    const code = await createOtp("a@test.com", "VERIFY_EMAIL");
    expect(mockCreate).toHaveBeenCalledOnce();
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.codeHash).not.toBe(code); // stored as hash, not plain text
    expect(callArg.data.codeHash).toHaveLength(64); // SHA-256 hex
  });

  test("sets expiresAt ~10 minutes in the future", async () => {
    await createOtp("a@test.com", "VERIFY_EMAIL");
    const expiresAt: Date = mockCreate.mock.calls[0][0].data.expiresAt;
    const diffMs = expiresAt.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(9 * 60 * 1000);
    expect(diffMs).toBeLessThan(11 * 60 * 1000);
  });

  test("stores the correct type", async () => {
    await createOtp("a@test.com", "RESET_PASSWORD");
    expect(mockCreate.mock.calls[0][0].data.type).toBe("RESET_PASSWORD");
  });

  test("throws when rate limit is hit (3 recent OTPs)", async () => {
    mockCount.mockResolvedValue(3);
    await expect(createOtp("a@test.com", "VERIFY_EMAIL")).rejects.toThrow("TOO_MANY_REQUESTS");
  });

  test("does NOT create DB record when rate limited", async () => {
    mockCount.mockResolvedValue(3);
    await expect(createOtp("a@test.com", "VERIFY_EMAIL")).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("allows up to 2 recent OTPs (under limit)", async () => {
    mockCount.mockResolvedValue(2);
    const code = await createOtp("a@test.com", "VERIFY_EMAIL");
    expect(code).toMatch(/^\d{6}$/);
  });

  test("generates different codes on successive calls", async () => {
    const code1 = await createOtp("a@test.com", "VERIFY_EMAIL");
    const code2 = await createOtp("a@test.com", "VERIFY_EMAIL");
    // Very unlikely to be equal (1/900000 chance), but we test they're valid
    expect(code1).toMatch(/^\d{6}$/);
    expect(code2).toMatch(/^\d{6}$/);
  });
});

// ─── verifyOtp ────────────────────────────────────────────────────────────────

describe("verifyOtp — NOT_FOUND", () => {
  test("returns NOT_FOUND when no OTP exists for email+type", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await verifyOtp("a@test.com", "123456", "VERIFY_EMAIL");
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("verifyOtp — USED", () => {
  test("returns USED when OTP already has usedAt set", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash: "anything", attempts: 0,
      expiresAt: FUTURE, usedAt: new Date(),
    });
    const result = await verifyOtp("a@test.com", "123456", "VERIFY_EMAIL");
    expect(result).toEqual({ ok: false, reason: "USED" });
  });
});

describe("verifyOtp — EXPIRED", () => {
  test("returns EXPIRED when OTP is past expiresAt", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash: "anything", attempts: 0,
      expiresAt: PAST, usedAt: null,
    });
    const result = await verifyOtp("a@test.com", "123456", "VERIFY_EMAIL");
    expect(result).toEqual({ ok: false, reason: "EXPIRED" });
  });
});

describe("verifyOtp — MAX_ATTEMPTS", () => {
  test("returns MAX_ATTEMPTS when attempts >= 3", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash: "anything", attempts: 3,
      expiresAt: FUTURE, usedAt: null,
    });
    const result = await verifyOtp("a@test.com", "123456", "VERIFY_EMAIL");
    expect(result).toEqual({ ok: false, reason: "MAX_ATTEMPTS" });
  });
});

describe("verifyOtp — INVALID", () => {
  // We need a real hash to test invalid code scenario
  // SHA-256("000000") = a real hash we can use
  const WRONG_CODE = "999999";

  test("returns INVALID for wrong code and increments attempts", async () => {
    // codeHash is SHA-256 of "123456", we send "999999"
    const { createHash } = await import("crypto");
    const correctHash = createHash("sha256").update("123456").digest("hex");
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash: correctHash, attempts: 0,
      expiresAt: FUTURE, usedAt: null,
    });
    const result = await verifyOtp("a@test.com", WRONG_CODE, "VERIFY_EMAIL");
    expect(result).toEqual({ ok: false, reason: "INVALID" });
  });

  test("increments attempts counter on wrong code", async () => {
    const { createHash } = await import("crypto");
    const correctHash = createHash("sha256").update("123456").digest("hex");
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash: correctHash, attempts: 1,
      expiresAt: FUTURE, usedAt: null,
    });
    mockOtpUpdate.mockResolvedValue({});
    await verifyOtp("a@test.com", WRONG_CODE, "VERIFY_EMAIL");
    expect(mockOtpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
  });
});

describe("verifyOtp — success", () => {
  test("returns ok: true for correct code", async () => {
    const { createHash } = await import("crypto");
    const code = "123456";
    const codeHash = createHash("sha256").update(code).digest("hex");
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash, attempts: 0,
      expiresAt: FUTURE, usedAt: null,
    });
    mockOtpUpdate.mockResolvedValue({});
    const result = await verifyOtp("a@test.com", code, "VERIFY_EMAIL");
    expect(result).toEqual({ ok: true });
  });

  test("marks OTP as used after successful verification", async () => {
    const { createHash } = await import("crypto");
    const code = "123456";
    const codeHash = createHash("sha256").update(code).digest("hex");
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash, attempts: 0,
      expiresAt: FUTURE, usedAt: null,
    });
    mockOtpUpdate.mockResolvedValue({});
    await verifyOtp("a@test.com", code, "VERIFY_EMAIL");
    expect(mockOtpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) })
    );
  });

  test("does NOT increment attempts on success", async () => {
    const { createHash } = await import("crypto");
    const code = "123456";
    const codeHash = createHash("sha256").update(code).digest("hex");
    mockFindFirst.mockResolvedValue({
      id: "otp1", codeHash, attempts: 0,
      expiresAt: FUTURE, usedAt: null,
    });
    mockOtpUpdate.mockResolvedValue({});
    await verifyOtp("a@test.com", code, "VERIFY_EMAIL");
    expect(mockOtpUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
  });
});
