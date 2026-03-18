import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
  },
}));

let mockCookieValue: string | undefined = undefined;

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === "dystoppia_uid" ? { value: mockCookieValue } : undefined),
    }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { GET } from "@/app/api/auth/me/route";

beforeEach(() => {
  mockUserFindUnique.mockReset();
  mockCookieValue = undefined;
});

describe("GET /api/auth/me — no cookie", () => {
  test("returns 401 when no cookie present", async () => {
    mockCookieValue = undefined;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("returns error message when no cookie", async () => {
    mockCookieValue = undefined;
    const res = await GET();
    const data = await res.json();
    expect(data.error).toMatch(/not authenticated/i);
  });
});

describe("GET /api/auth/me — with cookie", () => {
  test("returns 401 when user not found in DB", async () => {
    mockCookieValue = "user-ghost";
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("returns user data when found", async () => {
    mockCookieValue = "user-1";
    mockUserFindUnique.mockResolvedValue({ id: "user-1", email: "test@example.com" });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("user-1");
    expect(data.email).toBe("test@example.com");
  });

  test("queries DB with user id from cookie", async () => {
    mockCookieValue = "user-abc";
    mockUserFindUnique.mockResolvedValue({ id: "user-abc", email: "x@x.com" });
    await GET();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-abc" },
      select: { id: true, email: true },
    });
  });
});

describe("GET /api/auth/me — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockCookieValue = "user-1";
    mockUserFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  test("includes error details in 500 response", async () => {
    mockCookieValue = "user-1";
    mockUserFindUnique.mockRejectedValue(new Error("connection timeout"));
    const res = await GET();
    const data = await res.json();
    expect(data.details).toContain("connection timeout");
  });

  test("returns error key in 500 response", async () => {
    mockCookieValue = "user-1";
    mockUserFindUnique.mockRejectedValue(new Error("fail"));
    const res = await GET();
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});
