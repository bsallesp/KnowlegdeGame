import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subItem: { findMany: mockFindMany },
  },
}));

import { GET } from "@/app/api/stats/route";

function makeRequest(topicId?: string) {
  const url = topicId
    ? `http://localhost/api/stats?topicId=${topicId}`
    : "http://localhost/api/stats";
  return new NextRequest(url);
}

beforeEach(() => {
  mockFindMany.mockReset();
});

describe("GET /api/stats — validation", () => {
  test("returns 400 when topicId is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  test("returns error message when topicId missing", async () => {
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.error).toMatch(/topicId is required/i);
  });
});

describe("GET /api/stats — happy path", () => {
  test("returns 200 with stats object", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("topic-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats).toBeDefined();
  });

  test("returns empty stats when no subitems exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.stats).toEqual({});
  });

  test("calculates correctCount per subitem", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        difficulty: 2,
        answers: [
          { correct: true, createdAt: new Date("2026-01-01") },
          { correct: false, createdAt: new Date("2026-01-02") },
          { correct: true, createdAt: new Date("2026-01-03") },
        ],
      },
    ]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.stats["sub-1"].correctCount).toBe(2);
  });

  test("calculates totalCount per subitem", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        difficulty: 1,
        answers: [
          { correct: true, createdAt: new Date() },
          { correct: false, createdAt: new Date() },
        ],
      },
    ]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.stats["sub-1"].totalCount).toBe(2);
  });

  test("includes difficulty in stats", async () => {
    mockFindMany.mockResolvedValue([
      { id: "sub-1", difficulty: 3, answers: [] },
    ]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.stats["sub-1"].difficulty).toBe(3);
  });

  test("sets lastSeen to most recent answer createdAt", async () => {
    const recent = new Date("2026-03-15T10:00:00Z");
    const old = new Date("2026-01-01T00:00:00Z");
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        difficulty: 1,
        // first answer (index 0) is most recent (ordered by desc)
        answers: [
          { correct: true, createdAt: recent },
          { correct: false, createdAt: old },
        ],
      },
    ]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.stats["sub-1"].lastSeen).toBe(recent.toISOString());
  });

  test("sets lastSeen to undefined when no answers", async () => {
    mockFindMany.mockResolvedValue([
      { id: "sub-1", difficulty: 1, answers: [] },
    ]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.stats["sub-1"].lastSeen).toBeUndefined();
  });

  test("handles multiple subitems correctly", async () => {
    mockFindMany.mockResolvedValue([
      { id: "sub-1", difficulty: 1, answers: [{ correct: true, createdAt: new Date() }] },
      { id: "sub-2", difficulty: 2, answers: [{ correct: false, createdAt: new Date() }] },
    ]);
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(Object.keys(data.stats).length).toBe(2);
    expect(data.stats["sub-1"].correctCount).toBe(1);
    expect(data.stats["sub-2"].correctCount).toBe(0);
  });

  test("queries subitems filtered by topicId", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeRequest("my-topic-id"));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { item: { topicId: "my-topic-id" } },
      })
    );
  });
});

describe("GET /api/stats — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockFindMany.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeRequest("topic-1"));
    expect(res.status).toBe(500);
  });

  test("includes error string in 500 response", async () => {
    mockFindMany.mockRejectedValue(new Error("DB crashed"));
    const res = await GET(makeRequest("topic-1"));
    const data = await res.json();
    expect(data.error).toContain("DB crashed");
  });
});
