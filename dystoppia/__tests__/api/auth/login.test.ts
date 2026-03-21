import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── bcryptjs mock ────────────────────────────────────────────────────────────
const mockCompare = vi.hoisted(() => vi.fn());
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: mockCompare },
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));

// ─── Cookie mock ──────────────────────────────────────────────────────────────
const mockSet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: mockSet }),
}));

// ─── cookieToken mock ─────────────────────────────────────────────────────────
vi.mock("@/lib/cookieToken", () => ({ sign: vi.fn().mockReturnValue("signed-token") }));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { POST } from "@/app/api/auth/login/route";

const VERIFIED_USER = {
  id: "u1",
  email: "user@test.com",
  passwordHash: "$2a$12$real",
  emailVerified: true,
};

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(VERIFIED_USER);
  mockCompare.mockResolvedValue(true);
});

// ─── Missing fields ───────────────────────────────────────────────────────────

describe("POST /api/auth/login — missing fields", () => {
  test("returns 401 when email is missing", async () => {
    const res = await POST(req({ password: "secret" }));
    expect(res.status).toBe(401);
  });

  test("returns 401 when password is missing", async () => {
    const res = await POST(req({ email: "user@test.com" }));
    expect(res.status).toBe(401);
  });
});

// ─── Wrong credentials ────────────────────────────────────────────────────────

describe("POST /api/auth/login — wrong credentials", () => {
  test("returns 401 when user does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCompare.mockResolvedValue(false);
    const res = await POST(req({ email: "ghost@test.com", password: "anything" }));
    expect(res.status).toBe(401);
  });

  test("returns 401 when password is wrong", async () => {
    mockCompare.mockResolvedValue(false);
    const res = await POST(req({ email: "user@test.com", password: "wrongpassword" }));
    expect(res.status).toBe(401);
  });

  test("error message is always generic (no email enumeration)", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCompare.mockResolvedValue(false);
    const res = await POST(req({ email: "ghost@test.com", password: "pass" }));
    const data = await res.json();
    expect(data.error).toBe("Invalid email or password.");
  });

  test("runs bcrypt compare even when user not found (timing attack prevention)", async () => {
    mockFindUnique.mockResolvedValue(null);
    await POST(req({ email: "ghost@test.com", password: "anything" }));
    expect(mockCompare).toHaveBeenCalled();
  });
});

// ─── Email not verified ───────────────────────────────────────────────────────

describe("POST /api/auth/login — unverified email", () => {
  test("returns 403 when email is not verified", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
    const res = await POST(req({ email: "user@test.com", password: "password123" }));
    expect(res.status).toBe(403);
  });

  test("returns EMAIL_NOT_VERIFIED error code", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
    const res = await POST(req({ email: "user@test.com", password: "password123" }));
    const data = await res.json();
    expect(data.error).toBe("EMAIL_NOT_VERIFIED");
  });

  test("includes email in 403 response so client can redirect to verification", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
    const res = await POST(req({ email: "user@test.com", password: "password123" }));
    const data = await res.json();
    expect(data.email).toBe("user@test.com");
  });

  test("does NOT set session cookie when email is unverified", async () => {
    mockFindUnique.mockResolvedValue({ ...VERIFIED_USER, emailVerified: false });
    await POST(req({ email: "user@test.com", password: "password123" }));
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("POST /api/auth/login — success", () => {
  test("returns 200 with user id and email", async () => {
    const res = await POST(req({ email: "user@test.com", password: "password123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("u1");
    expect(data.email).toBe("user@test.com");
  });

  test("sets httpOnly session cookie on success", async () => {
    await POST(req({ email: "user@test.com", password: "password123" }));
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "signed-token",
      expect.objectContaining({ httpOnly: true })
    );
  });

  test("sets 1-year maxAge on session cookie", async () => {
    await POST(req({ email: "user@test.com", password: "password123" }));
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "signed-token",
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 365 })
    );
  });

  test("normalizes email to lowercase before querying DB", async () => {
    await POST(req({ email: "USER@TEST.COM", password: "password123" }));
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "user@test.com" } })
    );
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("POST /api/auth/login — error handling", () => {
  test("returns 500 when DB throws", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await POST(req({ email: "user@test.com", password: "password123" }));
    expect(res.status).toBe(500);
  });
});
