import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockGetAuthenticatedUser = vi.hoisted(() => vi.fn());
const mockGetCurrentCreditBalance = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  getAuthenticatedUser: mockGetAuthenticatedUser,
}));

vi.mock("@/lib/credits", () => ({
  getCurrentCreditBalance: mockGetCurrentCreditBalance,
}));

import { GET } from "@/app/api/credits/balance/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/credits/balance", () => {
  test("returns auth response when user is not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    );

    const res = await GET(new NextRequest("http://localhost/api/credits/balance"));
    expect(res.status).toBe(401);
  });

  test("returns current balance for authenticated user", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockGetCurrentCreditBalance.mockResolvedValue(120);

    const res = await GET(new NextRequest("http://localhost/api/credits/balance"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: "user-1",
      role: "master",
      balance: 120,
    });
  });
});
