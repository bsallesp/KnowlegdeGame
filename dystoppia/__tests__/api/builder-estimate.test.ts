import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockEstimateCredits = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/pricing", () => ({
  estimateCredits: mockEstimateCredits,
}));

import { POST } from "@/app/api/builder/estimate/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/builder/estimate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEstimateCredits.mockResolvedValue({
    rawCostUsd: 0.05,
    multiplier: 4,
    chargedCostUsd: 0.2,
    creditValueUsd: 0.01,
    rawCredits: 20,
    floorCredits: 5,
    finalCredits: 20,
    bufferFraction: 0.15,
    bufferedCredits: 23,
  });
});

describe("POST /api/builder/estimate", () => {
  test("returns auth response when role check fails", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const res = await POST(req({ prompt: "hello world" }));
    expect(res.status).toBe(403);
  });

  test("validates prompt", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const res = await POST(req({ prompt: "a" }));
    expect(res.status).toBe(400);
  });

  test("returns estimate for valid request", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });

    const res = await POST(
      req({ prompt: "Create a scoped MVP plan for a competitor analysis app." })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.estimate.estimatedCredits).toBeGreaterThan(0);
  });
});
