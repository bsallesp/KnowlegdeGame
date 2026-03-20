import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userAnswer: { findMany: mockFindMany },
  },
}));

import { GET } from "@/app/api/progress/route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/progress");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makeAnswer(correct: boolean, daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { correct, createdAt: d };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/progress", () => {
  test("returns empty history when no answers exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toEqual([]);
  });

  test("groups answers by date", async () => {
    const today = new Date();
    mockFindMany.mockResolvedValue([
      { correct: true,  createdAt: today },
      { correct: true,  createdAt: today },
      { correct: false, createdAt: today },
    ]);
    const res = await GET(makeRequest());
    const { history } = await res.json();
    expect(history).toHaveLength(1);
    expect(history[0].total).toBe(3);
    expect(history[0].correct).toBe(2);
  });

  test("calculates rate correctly", async () => {
    const today = new Date();
    mockFindMany.mockResolvedValue([
      { correct: true,  createdAt: today },
      { correct: false, createdAt: today },
    ]);
    const res = await GET(makeRequest());
    const { history } = await res.json();
    expect(history[0].rate).toBe(50);
  });

  test("groups answers from different days separately", async () => {
    mockFindMany.mockResolvedValue([
      makeAnswer(true, 0),
      makeAnswer(true, 1),
    ]);
    const res = await GET(makeRequest());
    const { history } = await res.json();
    expect(history).toHaveLength(2);
  });

  test("passes topicId filter to prisma when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeRequest({ topicId: "topic-abc" }));
    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.subItem?.item?.topicId).toBe("topic-abc");
  });

  test("uses default 30-day window when days param is absent", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeRequest());
    const whereArg = mockFindMany.mock.calls[0][0].where;
    const since: Date = whereArg.createdAt.gte;
    const diffDays = Math.round((Date.now() - since.getTime()) / 86400000);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  test("respects custom days param", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeRequest({ days: "7" }));
    const whereArg = mockFindMany.mock.calls[0][0].where;
    const since: Date = whereArg.createdAt.gte;
    const diffDays = Math.round((Date.now() - since.getTime()) / 86400000);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  test("returns 500 on prisma error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
