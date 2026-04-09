import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    executionRequest: {
      findFirst: mockFindFirst,
    },
  },
}));

import { GET } from "@/app/api/builder/requests/[id]/policy/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/builder/requests/[id]/policy", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const res = await GET(new NextRequest("http://localhost/api/builder/requests/req-1/policy"), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(403);
  });

  test("returns policy evaluation for request", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindFirst.mockResolvedValue({
      id: "req-1",
      prompt: "Scan an app and collect Reddit sentiment.",
      actionClass: "analysis_only",
      approvalGates: [],
    });

    const res = await GET(new NextRequest("http://localhost/api/builder/requests/req-1/policy"), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.policy).toEqual(
      expect.objectContaining({
        policyStatus: "allowed",
        executorType: "external_research_executor",
      })
    );
  });
});
