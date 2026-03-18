import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    topic: { findMany: mockFindMany },
  },
}));

import { GET } from "@/app/api/topics/route";

function makeRequest() {
  const { NextRequest } = require("next/server");
  return new NextRequest("http://localhost/api/topics");
}

beforeEach(() => {
  mockFindMany.mockReset();
});

function makeTopic(overrides: Record<string, unknown> = {}) {
  return {
    id: "topic-1",
    name: "AZ-900",
    slug: "az-900",
    createdAt: new Date("2026-01-01"),
    items: [],
    ...overrides,
  };
}

function makeTopicWithAnswers(correct: number, wrong: number) {
  return makeTopic({
    items: [
      {
        subItems: [
          {
            answers: [
              ...Array(correct).fill({ correct: true }),
              ...Array(wrong).fill({ correct: false }),
            ],
          },
        ],
      },
    ],
  });
}

describe("GET /api/topics — happy path", () => {
  test("returns 200 with topics array", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.topics)).toBe(true);
  });

  test("returns empty array when no topics exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics).toEqual([]);
  });

  test("returns topic with correct fields", async () => {
    mockFindMany.mockResolvedValue([makeTopic()]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0]).toMatchObject({
      id: "topic-1",
      name: "AZ-900",
      slug: "az-900",
    });
  });

  test("includes totalAnswers count", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(3, 2)]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0].totalAnswers).toBe(5);
  });

  test("calculates correctRate as rounded percentage", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(3, 2)]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0].correctRate).toBe(60);
  });

  test("correctRate is null when no answers", async () => {
    mockFindMany.mockResolvedValue([makeTopic()]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0].correctRate).toBeNull();
  });

  test("returns 100 correctRate when all correct", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(4, 0)]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0].correctRate).toBe(100);
  });

  test("returns 0 correctRate when all wrong", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(0, 5)]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0].correctRate).toBe(0);
  });

  test("returns multiple topics", async () => {
    mockFindMany.mockResolvedValue([
      makeTopic({ id: "t1", name: "AZ-900", slug: "az-900" }),
      makeTopic({ id: "t2", name: "AWS", slug: "aws" }),
    ]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics.length).toBe(2);
  });

  test("sums answers across multiple items and subitems", async () => {
    mockFindMany.mockResolvedValue([
      makeTopic({
        items: [
          { subItems: [{ answers: [{ correct: true }, { correct: false }] }] },
          { subItems: [{ answers: [{ correct: true }] }] },
        ],
      }),
    ]);
    const res = await GET();
    const data = await res.json();
    expect(data.topics[0].totalAnswers).toBe(3);
  });

  test("queries topics ordered by createdAt desc", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });
});

describe("GET /api/topics — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  test("includes error in 500 body", async () => {
    mockFindMany.mockRejectedValue(new Error("DB unavailable"));
    const res = await GET();
    const data = await res.json();
    expect(data.error).toContain("DB unavailable");
  });
});
