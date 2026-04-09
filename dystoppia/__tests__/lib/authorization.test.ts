import { describe, expect, test, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireUser = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authGuard", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
  },
}));

import {
  assertAllowedAction,
  getAuthenticatedUser,
  isActionAllowed,
  requireRole,
} from "@/lib/authorization";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isActionAllowed", () => {
  test("allows master for builder privileged actions", () => {
    expect(
      isActionAllowed({
        role: "master",
        actionClass: "privileged_execution",
        module: "builder",
      })
    ).toBe(true);
  });

  test("denies customer access to builder actions", () => {
    expect(
      isActionAllowed({
        role: "customer",
        actionClass: "analysis_only",
        module: "builder",
      })
    ).toBe(false);
  });

  test("allows customer read-only non-builder actions", () => {
    expect(
      isActionAllowed({
        role: "customer",
        actionClass: "read_only",
        module: "learning",
      })
    ).toBe(true);
  });
});

describe("getAuthenticatedUser", () => {
  test("returns auth response when base auth fails", async () => {
    mockRequireUser.mockResolvedValue(
      Response.json({ error: "Not authenticated" }, { status: 401 })
    );

    const out = await getAuthenticatedUser(new NextRequest("http://localhost/"));
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(401);
  });

  test("returns 401 when DB user is missing", async () => {
    mockRequireUser.mockResolvedValue({ userId: "user-1" });
    mockUserFindUnique.mockResolvedValue(null);

    const out = await getAuthenticatedUser(new NextRequest("http://localhost/"));
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(401);
  });

  test("returns 403 when account is not active", async () => {
    mockRequireUser.mockResolvedValue({ userId: "user-1" });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      role: "customer",
      status: "disabled",
      isInternal: false,
    });

    const out = await getAuthenticatedUser(new NextRequest("http://localhost/"));
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(403);
  });

  test("returns normalized user context", async () => {
    mockRequireUser.mockResolvedValue({ userId: "user-1" });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const out = await getAuthenticatedUser(new NextRequest("http://localhost/"));
    expect(out).toEqual({
      userId: "user-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
  });
});

describe("requireRole", () => {
  test("returns forbidden when role does not match", async () => {
    mockRequireUser.mockResolvedValue({ userId: "user-1" });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      role: "customer",
      status: "active",
      isInternal: false,
    });

    const out = await requireRole(new NextRequest("http://localhost/"), "master");
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(403);
  });

  test("returns user context when role matches", async () => {
    mockRequireUser.mockResolvedValue({ userId: "user-1" });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const out = await requireRole(new NextRequest("http://localhost/"), "master");
    expect(out).toEqual({
      userId: "user-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
  });
});

describe("assertAllowedAction", () => {
  test("returns null when allowed", async () => {
    expect(
      assertAllowedAction({
        role: "master",
        actionClass: "billable_generation",
        module: "builder",
      })
    ).toBeNull();
  });

  test("returns 403 response when denied", async () => {
    const out = assertAllowedAction({
      role: "customer",
      actionClass: "analysis_only",
      module: "builder",
    });

    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(403);
  });
});
