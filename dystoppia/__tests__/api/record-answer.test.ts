import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userAnswer: { create: mockCreate, findMany: mockFindMany },
    subItem: { findUnique: mockFindUnique, update: mockUpdate },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/record-answer/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/record-answer", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  questionId: "q-1",
  subItemId: "sub-1",
  sessionId: "sess-1",
  correct: true,
  timeSpent: 8000,
};

const mockSubItem = {
  difficulty: 2,
  easeFactor: 2.5,
  reviewInterval: 1,
};

beforeEach(() => {
  mockCreate.mockReset();
  mockFindMany.mockReset();
  mockFindUnique.mockReset();
  mockUpdate.mockReset();

  mockCreate.mockResolvedValue({ id: "ans-1" });
  mockFindMany.mockResolvedValue([
    { correct: true, createdAt: new Date() },
    { correct: true, createdAt: new Date() },
    { correct: true, createdAt: new Date() },
  ]);
  mockFindUnique.mockResolvedValue(mockSubItem);
  mockUpdate.mockResolvedValue({ ...mockSubItem, difficulty: 2 });
});

describe("POST /api/record-answer — validation", () => {
  test("returns 400 when questionId is missing", async () => {
    const res = await POST(makeRequest({ subItemId: "sub-1", sessionId: "sess-1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when subItemId is missing", async () => {
    const res = await POST(makeRequest({ questionId: "q-1", sessionId: "sess-1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when sessionId is missing", async () => {
    const res = await POST(makeRequest({ questionId: "q-1", subItemId: "sub-1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 error message", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();
    expect(data.error).toMatch(/missing required/i);
  });
});

describe("POST /api/record-answer — happy path", () => {
  test("returns 200 on valid answer", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
  });

  test("creates a UserAnswer record", async () => {
    await POST(makeRequest(validBody));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questionId: "q-1",
        subItemId: "sub-1",
        sessionId: "sess-1",
        correct: true,
      }),
    });
  });

  test("stores correct: false properly", async () => {
    await POST(makeRequest({ ...validBody, correct: false }));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ correct: false }),
    });
  });

  test("defaults timeSpent to 0 when not provided", async () => {
    const { timeSpent: _, ...bodyWithoutTime } = validBody;
    await POST(makeRequest(bodyWithoutTime));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ timeSpent: 0 }),
    });
  });

  test("updates subItem difficulty", async () => {
    await POST(makeRequest(validBody));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sub-1" } })
    );
  });

  test("response includes correctCount", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    // Response structure: { success, newDifficulty, nextReviewAt, stats: { correctCount, totalCount, difficulty } }
    expect(data.stats.correctCount).toBeDefined();
  });

  test("response includes totalCount", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.stats.totalCount).toBeDefined();
  });

  test("response includes new difficulty", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.newDifficulty).toBeDefined();
  });

  test("updates SM-2 easeFactor", async () => {
    await POST(makeRequest(validBody));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ easeFactor: expect.any(Number) }),
      })
    );
  });

  test("updates SM-2 reviewInterval", async () => {
    await POST(makeRequest(validBody));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewInterval: expect.any(Number) }),
      })
    );
  });

  test("updates nextReviewAt", async () => {
    await POST(makeRequest(validBody));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextReviewAt: expect.any(Date) }),
      })
    );
  });
});

describe("POST /api/record-answer — subItem not found", () => {
  test("returns 404 when subItem not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  test("returns error message when subItem missing", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});

describe("POST /api/record-answer — error handling", () => {
  test("returns 500 when prisma.userAnswer.create throws", async () => {
    mockCreate.mockRejectedValue(new Error("DB write error"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });

  test("returns 500 when prisma.subItem.update throws", async () => {
    mockUpdate.mockRejectedValue(new Error("constraint error"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
