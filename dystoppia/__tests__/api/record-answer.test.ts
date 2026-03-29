import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { calculateSM2 } from "@/lib/adaptive";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockAnswerFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userAnswer: {
      create: mockCreate,
      findMany: mockFindMany,
      findUnique: mockAnswerFindUnique,
    },
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
  mockAnswerFindUnique.mockReset();
  mockUpdate.mockReset();

  mockAnswerFindUnique.mockResolvedValue(null);
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

describe("POST /api/record-answer — idempotency", () => {
  const idemBody = { ...validBody, idempotencyKey: "idem-1" };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00.000Z"));
    const stored = {
      difficulty: 2,
      easeFactor: 2.5,
      reviewInterval: 1,
      nextReviewAt: null as Date | null,
    };
    mockFindUnique.mockImplementation(async () => {
      const sm2 = calculateSM2(stored.easeFactor, stored.reviewInterval, true, 8000, 15000);
      return {
        difficulty: stored.difficulty,
        easeFactor: stored.easeFactor,
        reviewInterval: stored.reviewInterval,
        nextReviewAt: stored.nextReviewAt ?? sm2.nextReviewAt,
      };
    });
    mockUpdate.mockImplementation(
      async (args: {
        data: { difficulty: number; easeFactor: number; reviewInterval: number; nextReviewAt: Date };
      }) => {
        const d = args.data;
        stored.difficulty = d.difficulty;
        stored.easeFactor = d.easeFactor;
        stored.reviewInterval = d.reviewInterval;
        stored.nextReviewAt = d.nextReviewAt;
        return { count: 1 };
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns 409 when idempotency key repeats for different question", async () => {
    mockAnswerFindUnique.mockResolvedValue({
      id: "a1",
      questionId: "other-q",
      subItemId: "sub-1",
      sessionId: "sess-1",
      idempotencyKey: "idem-1",
    });
    const res = await POST(makeRequest(idemBody));
    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("persists idempotency key on first create", async () => {
    await POST(makeRequest(idemBody));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: "idem-1",
        sessionId: "sess-1",
      }),
    });
  });

  test("does not create a second UserAnswer when the same idempotency key is retried", async () => {
    mockAnswerFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "a1",
        questionId: "q-1",
        subItemId: "sub-1",
        sessionId: "sess-1",
        idempotencyKey: "idem-1",
      });

    await POST(makeRequest(idemBody));
    await POST(makeRequest(idemBody));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  test("returns the same JSON payload for a retried idempotent submission", async () => {
    mockAnswerFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "a1",
        questionId: "q-1",
        subItemId: "sub-1",
        sessionId: "sess-1",
        idempotencyKey: "idem-1",
      });

    const first = await POST(makeRequest(idemBody));
    const second = await POST(makeRequest(idemBody));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
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
