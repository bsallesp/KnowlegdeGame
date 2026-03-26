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
    subItem: { findUnique: mockFindUnique, updateMany: mockUpdate },
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
  mockUpdate.mockResolvedValue({ count: 1 });
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

  test("returns 400 when questionId is empty string", async () => {
    const res = await POST(makeRequest({ ...validBody, questionId: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when subItemId is empty string", async () => {
    const res = await POST(makeRequest({ ...validBody, subItemId: "" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when sessionId is empty string", async () => {
    const res = await POST(makeRequest({ ...validBody, sessionId: "" }));
    expect(res.status).toBe(400);
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

  test("coerces non-boolean correct to boolean", async () => {
    await POST(makeRequest({ ...validBody, correct: "yes" as unknown as boolean }));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ correct: true }),
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
      expect.objectContaining({
        where: expect.objectContaining({ id: "sub-1" }),
      })
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

  test("response nextReviewAt is ISO string", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(typeof data.nextReviewAt).toBe("string");
    expect(Number.isNaN(Date.parse(data.nextReviewAt))).toBe(false);
  });

  test("requests recent answers with take=5 for adaptive update", async () => {
    await POST(makeRequest(validBody));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subItemId: "sub-1", sessionId: "sess-1" },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    );
  });

  test("requests all answers for final stats without take limit", async () => {
    await POST(makeRequest(validBody));
    expect(mockFindMany).toHaveBeenLastCalledWith({
      where: { subItemId: "sub-1", sessionId: "sess-1" },
    });
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

  test("processes duplicated submissions as separate records", async () => {
    const first = await POST(makeRequest(validBody));
    const second = await POST(makeRequest(validBody));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/record-answer — idempotency roadmap", () => {
  test.todo("rejects duplicate answer submission when idempotency key repeats");
  test.todo("returns same result for retried submission without duplicating writes");
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

  test("returns 500 when CAS update keeps conflicting", async () => {
    mockUpdate.mockResolvedValue({ count: 0 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });

  test("500 body includes stable error message", async () => {
    mockCreate.mockRejectedValue(new Error("DB write error"));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBe("Failed to record answer");
  });
});
