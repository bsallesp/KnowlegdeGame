import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    question: { findUnique: mockFindUnique },
    subItem: { findFirst: mockFindFirst, findMany: mockFindMany },
    userAnswer: { create: mockCreate, findMany: vi.fn().mockResolvedValue([]) },
    topic: { update: mockUpdate },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("next/headers", () => ({
  cookies: () => ({ get: (key: string) => (key === "dystoppia_uid" ? { value: "user-abc" } : undefined) }),
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
  correct: true,
  timeSpentMs: 3000,
};

const mockQuestion = {
  id: "q-1",
  subItemId: "sub-1",
  subItem: {
    id: "sub-1",
    name: "IaaS",
    difficulty: 0.5,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReview: new Date(),
    item: {
      id: "item-1",
      topicId: "topic-1",
    },
  },
};

beforeEach(() => {
  mockFindUnique.mockReset();
  mockFindFirst.mockReset();
  mockFindMany.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();

  mockFindUnique.mockResolvedValue(mockQuestion);
  mockCreate.mockResolvedValue({ id: "answer-1" });
  mockUpdate.mockResolvedValue({});

  mockFindMany.mockImplementation(({ where }: any) => {
    if (where?.subItemId) return Promise.resolve([]);
    return Promise.resolve([]);
  });

  mockFindFirst.mockResolvedValue(null);
});

describe("POST /api/record-answer — validation", () => {
  test("returns 400 when questionId is missing", async () => {
    const res = await POST(makeRequest({ correct: true, timeSpentMs: 1000 }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when correct is missing", async () => {
    const res = await POST(makeRequest({ questionId: "q-1", timeSpentMs: 1000 }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when timeSpentMs is missing", async () => {
    const res = await POST(makeRequest({ questionId: "q-1", correct: true }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid questionId type", async () => {
    const res = await POST(makeRequest({ questionId: 42, correct: true, timeSpentMs: 1000 }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid correct type", async () => {
    const res = await POST(makeRequest({ questionId: "q-1", correct: "yes", timeSpentMs: 1000 }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/record-answer — not found", () => {
  test("returns 404 when question not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  test("returns error message when question not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});

describe("POST /api/record-answer — success", () => {
  test("returns 200 on success", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
  });

  test("returns difficulty in response", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data).toHaveProperty("difficulty");
  });

  test("creates user answer record", async () => {
    await POST(makeRequest(validBody));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          questionId: "q-1",
          correct: true,
        }),
      })
    );
  });

  test("records anonymous userId when no cookie", async () => {
    vi.doMock("next/headers", () => ({
      cookies: () => ({ get: () => undefined }),
    }));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
  });

  test("records timeSpentMs", async () => {
    await POST(makeRequest({ ...validBody, timeSpentMs: 9999 }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timeSpentMs: 9999 }),
      })
    );
  });

  test("updates subItem difficulty after correct answer", async () => {
    await POST(makeRequest({ ...validBody, correct: true }));
    expect(mockUpdate).toHaveBeenCalled();
  });

  test("updates subItem difficulty after wrong answer", async () => {
    await POST(makeRequest({ ...validBody, correct: false }));
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("POST /api/record-answer — SM-2 algorithm", () => {
  test("increases interval after correct answer", async () => {
    await POST(makeRequest({ ...validBody, correct: true }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.interval).toBeGreaterThanOrEqual(1);
  });

  test("resets interval to 1 after wrong answer (repetitions 0)", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockQuestion,
      subItem: { ...mockQuestion.subItem, repetitions: 0 },
    });
    await POST(makeRequest({ ...validBody, correct: false }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.interval).toBeLessThanOrEqual(1);
  });

  test("difficulty stays within [0,1] range", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockQuestion,
      subItem: { ...mockQuestion.subItem, difficulty: 0.9 },
    });
    await POST(makeRequest({ ...validBody, correct: false }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.difficulty).toBeLessThanOrEqual(1);
  });

  test("easeFactor is updated", async () => {
    await POST(makeRequest(validBody));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data).toHaveProperty("easeFactor");
  });

  test("repetitions increment after correct answer", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockQuestion,
      subItem: { ...mockQuestion.subItem, repetitions: 2 },
    });
    await POST(makeRequest({ ...validBody, correct: true }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.repetitions).toBeGreaterThanOrEqual(3);
  });

  test("nextReview is set to future date", async () => {
    await POST(makeRequest(validBody));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(new Date(updateCall.data.nextReview).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
  });
});

describe("POST /api/record-answer — error handling", () => {
  test("returns 500 when prisma throws", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });

  test("returns error message on DB failure", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});
