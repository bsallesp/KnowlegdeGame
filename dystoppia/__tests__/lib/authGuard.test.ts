import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCookieGet = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookieGet(name),
  })),
}));

const mockVerify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cookieToken", () => ({
  verify: mockVerify,
}));

import { requireUser } from "@/lib/authGuard";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireUser", () => {
  test("returns 401 JSON when dystoppia_uid cookie is missing", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const res = await requireUser(new NextRequest("http://localhost/"));
    expect(res.status).toBe(401);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/not authenticated/i);
  });

  test("returns 401 when token fails verification", async () => {
    mockCookieGet.mockImplementation((name: string) =>
      name === "dystoppia_uid" ? { value: "bad-token" } : undefined
    );
    mockVerify.mockReturnValue(null);
    const res = await requireUser(new NextRequest("http://localhost/"));
    expect(res.status).toBe(401);
    const body = await (res as Response).json();
    expect(body.error).toMatch(/invalid session/i);
  });

  test("returns userId when cookie verifies", async () => {
    mockCookieGet.mockImplementation((name: string) =>
      name === "dystoppia_uid" ? { value: "signed-token" } : undefined
    );
    mockVerify.mockReturnValue("user-abc");
    const out = await requireUser(new NextRequest("http://localhost/"));
    expect(out).toEqual({ userId: "user-abc" });
  });
});
