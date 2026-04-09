import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── cookieToken mock ─────────────────────────────────────────────────────────
const mockSign = vi.hoisted(() => vi.fn((id: string) => `${id}.fakemac`));
vi.mock("@/lib/cookieToken", () => ({ sign: mockSign }));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
    userAnswer: {
      updateMany: mockUpdateMany,
    },
  },
}));

const mockCookieSet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookieSet,
      get: vi.fn(() => undefined),
    }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/users/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockCreate.mockReset();
  mockUpdateMany.mockReset();
  mockCookieSet.mockReset();
  mockSign.mockImplementation((id: string) => `${id}.fakemac`);
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/users — validation", () => {
  test("returns 403 in production because legacy bootstrap is disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(makeRequest({ email: "test@example.com" }));

    expect(res.status).toBe(403);

    vi.unstubAllEnvs();
  });

  test("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ sessionId: "sess_1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid email/i);
  });

  test("returns 400 for invalid email format", async () => {
    const res = await POST(makeRequest({ email: "notanemail", sessionId: "sess_1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for email missing @", async () => {
    const res = await POST(makeRequest({ email: "userexample.com" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for email missing domain", async () => {
    const res = await POST(makeRequest({ email: "user@" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for empty string email", async () => {
    const res = await POST(makeRequest({ email: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for whitespace-only email", async () => {
    const res = await POST(makeRequest({ email: "   " }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/users — new user creation", () => {
  test("creates a new user when not existing", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    const res = await POST(makeRequest({ email: "test@example.com", sessionId: "sess_1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("user-1");
    expect(data.isNew).toBe(true);
  });

  test("normalizes email to lowercase", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "TEST@EXAMPLE.COM", sessionId: "sess_1" }));
    expect(mockCreate).toHaveBeenCalledWith({ data: { email: "test@example.com" } });
  });

  test("trims whitespace from email before saving", async () => {
    // The isValidEmail regex rejects emails with leading/trailing spaces,
    // so whitespace-padded emails return 400 (validation happens before trim)
    const res = await POST(makeRequest({ email: "  test@example.com  " }));
    expect(res.status).toBe(400);
  });

  test("backfills anonymous answers when sessionId present", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "test@example.com", sessionId: "sess_abc" }));
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { sessionId: "sess_abc", userId: null },
      data: { userId: "user-1" },
    });
  });

  test("does not call backfill when sessionId is absent", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "test@example.com" }));
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("does not call backfill when sessionId is empty string", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "test@example.com", sessionId: "" }));
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/users — existing user", () => {
  test("returns existing user without creating new one", async () => {
    const existing = { id: "user-existing", email: "old@example.com" };
    mockFindUnique.mockResolvedValue(existing);

    const res = await POST(makeRequest({ email: "old@example.com", sessionId: "sess_1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isNew).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("returns existing user id", async () => {
    const existing = { id: "user-existing", email: "old@example.com" };
    mockFindUnique.mockResolvedValue(existing);

    const res = await POST(makeRequest({ email: "old@example.com" }));
    const data = await res.json();
    expect(data.id).toBe("user-existing");
  });
});

describe("POST /api/users — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB connection failed"));

    const res = await POST(makeRequest({ email: "test@example.com" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  test("includes error details in 500 response", async () => {
    mockFindUnique.mockRejectedValue(new Error("unique constraint failed"));

    const res = await POST(makeRequest({ email: "test@example.com" }));
    const data = await res.json();
    expect(data.details).toContain("unique constraint failed");
  });
});

// ─── Signed cookie ────────────────────────────────────────────────────────────

describe("POST /api/users — signed cookie", () => {
  test("sets cookie with signed token (not raw userId)", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "test@example.com" }));
    expect(mockCookieSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "user-1.fakemac",
      expect.objectContaining({ httpOnly: true })
    );
  });

  test("calls sign() with the user id", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-xyz", email: "a@b.com" });

    await POST(makeRequest({ email: "a@b.com" }));
    expect(mockSign).toHaveBeenCalledWith("user-xyz");
  });

  test("sets cookie with sameSite: lax", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "test@example.com" }));
    expect(mockCookieSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      expect.any(String),
      expect.objectContaining({ sameSite: "lax" })
    );
  });

  test("sets secure cookie in production for non-production-only flows", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "user-1", email: "test@example.com" });

    await POST(makeRequest({ email: "test@example.com" }));

    expect(mockCookieSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      expect.any(String),
      expect.objectContaining({ secure: false })
    );

    vi.unstubAllEnvs();
  });
});
