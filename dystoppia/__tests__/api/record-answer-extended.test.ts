import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock — matches actual API: subItem.findUnique, subItem.update,
//     userAnswer.create, userAnswer.findMany ────────────────────────────────
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subItem: { findUnique: mockFindUnique, updateMany: mockUpdate },
    userAnswer: { create: mockCreate, findMany: mockFindMany },
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

// API requires: questionId, subItemId, sessionId (validates these three)
const validBody = {
  questionId: "q-1",
  subItemId: "sub-1",
  sessionId: "sess-1",
  correct: true,
  timeSpent: 3000,
};

// subItem as returned by prisma.subItem.findUnique
const mockSubItem = {
  difficulty: 0.5,
  easeFactor: 2.5,
  reviewInterval: 1,
};

beforeEach(() => {
  mockFindUnique.mockReset();
  mockFindMany.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();

  mockFindUnique.mockResolvedValue(mockSubItem);
  mockCreate.mockResolvedValue({ id: "answer-1" });
  mockUpdate.mockResolvedValue({ count: 1 });
  mockFindMany.mockResolvedValue([{ correct: true, createdAt: new Date() }]);
});

// ─── SM-2 field naming (guards against regressions on field name changes) ────
describe("POST /api/record-answer — SM-2 field names", () => {
  // API uses reviewInterval (not interval) and nextReviewAt (not nextReview)
  test("update payload uses 'reviewInterval' not 'interval'", async () => {
    await POST(makeRequest({ ...validBody, correct: true }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data).toHaveProperty("reviewInterval");
    expect(updateCall.data).not.toHaveProperty("interval");
  });

  test("update payload uses 'nextReviewAt' not 'nextReview'", async () => {
    await POST(makeRequest(validBody));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data).toHaveProperty("nextReviewAt");
    expect(updateCall.data).not.toHaveProperty("nextReview");
  });

  test("update payload uses 'difficulty' not 'difficultyScore'", async () => {
    await POST(makeRequest(validBody));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data).toHaveProperty("difficulty");
    expect(updateCall.data).not.toHaveProperty("difficultyScore");
  });
});

// ─── SM-2 value constraints ───────────────────────────────────────────────────
describe("POST /api/record-answer — SM-2 value constraints", () => {
  test("reviewInterval >= 1 after correct answer", async () => {
    await POST(makeRequest({ ...validBody, correct: true }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.reviewInterval).toBeGreaterThanOrEqual(1);
  });

  test("difficulty is clamped between 0 and 1 after wrong answer", async () => {
    await POST(makeRequest({ ...validBody, correct: false }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.difficulty).toBeLessThanOrEqual(1);
    expect(updateCall.data.difficulty).toBeGreaterThanOrEqual(0);
  });

  test("easeFactor stays >= 1.3 after wrong answer", async () => {
    await POST(makeRequest({ ...validBody, correct: false }));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  test("nextReviewAt is an actual Date instance", async () => {
    await POST(makeRequest(validBody));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.data.nextReviewAt).toBeInstanceOf(Date);
  });

  test("update where clause targets the correct subItemId", async () => {
    await POST(makeRequest(validBody));
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.where).toEqual(
      expect.objectContaining({ id: "sub-1" })
    );
  });
});

// ─── timeSpent field name guard ───────────────────────────────────────────────
describe("POST /api/record-answer — timeSpent field", () => {
  test("records field as 'timeSpent' not 'timeSpentMs'", async () => {
    await POST(makeRequest({ ...validBody, timeSpent: 9999 }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timeSpent: 9999 }),
      })
    );
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data).not.toHaveProperty("timeSpentMs");
  });

  test("defaults to 0 when timeSpent is omitted", async () => {
    const { timeSpent: _, ...bodyWithout } = validBody;
    await POST(makeRequest(bodyWithout));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ timeSpent: 0 }),
      })
    );
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────
describe("POST /api/record-answer — response shape", () => {
  test("stats object contains 'correctCount' and 'totalCount'", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.stats).toHaveProperty("correctCount");
    expect(data.stats).toHaveProperty("totalCount");
  });

  test("stats object contains 'difficulty'", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.stats).toHaveProperty("difficulty");
  });
});
