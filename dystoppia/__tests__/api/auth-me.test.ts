import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── cookieToken mock ─────────────────────────────────────────────────────────
// We mock the verify function so tests are independent of crypto implementation.

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cookieToken", () => ({ verify: mockVerify }));

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
      get: (name: string) =>
        name === "dystoppia_uid" ? (mockCookieValue !== undefined ? { value: mockCookieValue } : undefined) : undefined,
    }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { GET } from "@/app/api/auth/me/route";

beforeEach(() => {
  mockUserFindUnique.mockReset();
  mockVerify.mockReset();
  mockCookieValue = undefined;
});

// ─── No cookie ────────────────────────────────────────────────────────────────

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

  test("does not attempt token verification without cookie", async () => {
    mockCookieValue = undefined;
    await GET();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

// ─── Tampered / invalid token ─────────────────────────────────────────────────

describe("GET /api/auth/me — invalid token", () => {
  test("returns 401 when token fails HMAC verification", async () => {
    mockCookieValue = "user-1.tamperedmac00000000000000000000000";
    mockVerify.mockReturnValue(null); // tampered token
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("does not query DB when token is invalid", async () => {
    mockCookieValue = "garbage";
    mockVerify.mockReturnValue(null);
    await GET();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  test("returns stable not authenticated message for invalid token", async () => {
    mockCookieValue = "garbage";
    mockVerify.mockReturnValue(null);
    const res = await GET();
    const data = await res.json();
    expect(data.error).toBe("Not authenticated");
  });
});

// ─── Valid signed token ───────────────────────────────────────────────────────

describe("GET /api/auth/me — valid token", () => {
  test("returns 401 when user not found in DB", async () => {
    mockCookieValue = "user-ghost.abc";
    mockVerify.mockReturnValue("user-ghost");
    mockUserFindUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  test("returns user data when found", async () => {
    mockCookieValue = "user-1.mac";
    mockVerify.mockReturnValue("user-1");
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      credits: 47,
      plan: "free",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("user-1");
    expect(data.email).toBe("test@example.com");
  });

  test("returns credits in response", async () => {
    mockCookieValue = "user-1.mac";
    mockVerify.mockReturnValue("user-1");
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      credits: 23,
      plan: "learner",
    });
    const res = await GET();
    const data = await res.json();
    expect(data.credits).toBe(23);
  });

  test("returns plan in response", async () => {
    mockCookieValue = "user-1.mac";
    mockVerify.mockReturnValue("user-1");
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      credits: 500,
      plan: "learner",
    });
    const res = await GET();
    const data = await res.json();
    expect(data.plan).toBe("learner");
  });

  test("queries DB with userId extracted from verified token", async () => {
    mockCookieValue = "user-abc.mac";
    mockVerify.mockReturnValue("user-abc");
    mockUserFindUnique.mockResolvedValue({
      id: "user-abc",
      email: "x@x.com",
      credits: 50,
      plan: "free",
    });
    await GET();
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-abc" },
      select: { id: true, email: true, credits: true, plan: true },
    });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("GET /api/auth/me — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockCookieValue = "user-1.mac";
    mockVerify.mockReturnValue("user-1");
    mockUserFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  test("includes error details in 500 response", async () => {
    mockCookieValue = "user-1.mac";
    mockVerify.mockReturnValue("user-1");
    mockUserFindUnique.mockRejectedValue(new Error("connection timeout"));
    const res = await GET();
    const data = await res.json();
    expect(data.details).toContain("connection timeout");
  });
});
