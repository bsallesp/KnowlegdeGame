import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    topic: { findMany: mockFindMany, findUnique: mockFindUnique },
  },
}));

import { GET } from "@/app/api/topics/route";

function makeRequest() {
  const { NextRequest } = require("next/server");
  return new NextRequest("http://localhost/api/topics");
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindUnique.mockReset();
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

function makeRequestWithSlug(slug: string) {
  const { NextRequest } = require("next/server");
  return new NextRequest(`http://localhost/api/topics?slug=${encodeURIComponent(slug)}`);
}

describe("GET /api/topics — happy path", () => {
  test("returns 200 with topics array", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.topics)).toBe(true);
  });

  test("returns empty array when no topics exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics).toEqual([]);
  });

  test("returns topic with correct fields", async () => {
    mockFindMany.mockResolvedValue([makeTopic()]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0]).toMatchObject({
      id: "topic-1",
      name: "AZ-900",
      slug: "az-900",
    });
  });

  test("includes totalAnswers count", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(3, 2)]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0].totalAnswers).toBe(5);
  });

  test("calculates correctRate as rounded percentage", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(3, 2)]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0].correctRate).toBe(60);
  });

  test("correctRate is null when no answers", async () => {
    mockFindMany.mockResolvedValue([makeTopic()]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0].correctRate).toBeNull();
  });

  test("returns 100 correctRate when all correct", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(4, 0)]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0].correctRate).toBe(100);
  });

  test("returns 0 correctRate when all wrong", async () => {
    mockFindMany.mockResolvedValue([makeTopicWithAnswers(0, 5)]);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0].correctRate).toBe(0);
  });

  test("returns multiple topics", async () => {
    mockFindMany.mockResolvedValue([
      makeTopic({ id: "t1", name: "AZ-900", slug: "az-900" }),
      makeTopic({ id: "t2", name: "AWS", slug: "aws" }),
    ]);
    const res = await GET(makeRequest());
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
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.topics[0].totalAnswers).toBe(3);
  });

  test("queries topics ordered by createdAt desc", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeRequest());
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });
});

describe("GET /api/topics — slug branch", () => {
  test("returns 404 when topic not found for slug", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequestWithSlug("missing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Topic not found");
  });

  test("returns full topic for slug including mapped items/subItems", async () => {
    mockFindUnique.mockResolvedValue({
      id: "topic-1",
      name: "AZ-900",
      slug: "az-900",
      createdAt: new Date("2026-01-01"),
      teachingProfile: JSON.stringify({ style: "scenario_based", register: "technical" }),
      items: [
        {
          id: "item-1",
          topicId: "topic-1",
          name: "Cloud Concepts",
          order: 0,
          muted: false,
          subItems: [
            {
              id: "sub-1",
              itemId: "item-1",
              name: "IaaS",
              order: 0,
              muted: false,
              difficulty: 1,
              // fields not needed by the route mapping are omitted
            },
          ],
        },
      ],
    });

    const res = await GET(makeRequestWithSlug("az-900"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.slug).toBe("az-900");
    expect(body.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.teachingProfile).toEqual({ style: "scenario_based", register: "technical" });
    expect(body.items).toHaveLength(1);
    expect(body.items[0].subItems).toHaveLength(1);
    expect(body.items[0].subItems[0].difficulty).toBe(1);
  });

  test("returns null teachingProfile when teachingProfile is null in DB", async () => {
    mockFindUnique.mockResolvedValue({
      id: "topic-1",
      name: "AZ-900",
      slug: "az-900",
      createdAt: new Date("2026-01-01"),
      teachingProfile: null,
      items: [],
    });

    const res = await GET(makeRequestWithSlug("az-900"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.teachingProfile).toBeNull();
  });
});

describe("GET /api/topics — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  test("includes error in 500 body", async () => {
    mockFindMany.mockRejectedValue(new Error("DB unavailable"));
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.error).toContain("DB unavailable");
  });
});
