import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockQuestionFindUnique = vi.hoisted(() => vi.fn());
const mockQuestionUpdate = vi.hoisted(() => vi.fn());
const mockAnswerFindFirst = vi.hoisted(() => vi.fn());
const mockAnswerFindMany = vi.hoisted(() => vi.fn());
const mockAnswerUpdate = vi.hoisted(() => vi.fn());
const mockSubItemUpdate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockRequireUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    question: { findUnique: mockQuestionFindUnique },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/authGuard", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/report-question/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/report-question", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockQuestionFindUnique.mockResolvedValue({
    id: "q-1",
    subItemId: "sub-1",
    flaggedAt: null,
    flaggedReason: null,
  });

  mockQuestionUpdate.mockResolvedValue({});
  mockAnswerFindFirst.mockResolvedValue({
    id: "ans-1",
    questionId: "q-1",
    sessionId: "sess-1",
  });
  mockAnswerUpdate.mockResolvedValue({});
  mockAnswerFindMany
    .mockResolvedValueOnce([
      { sessionId: "sess-1", correct: true, timeSpent: 4000, createdAt: new Date("2026-04-13T10:00:00Z") },
    ])
    .mockResolvedValueOnce([]);
  mockSubItemUpdate.mockResolvedValue({
    difficulty: 1,
    nextReviewAt: null,
  });

  mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      question: { update: mockQuestionUpdate },
      userAnswer: {
        findFirst: mockAnswerFindFirst,
        update: mockAnswerUpdate,
        findMany: mockAnswerFindMany,
      },
      subItem: { update: mockSubItemUpdate },
    })
  );
});

describe("POST /api/report-question", () => {
  test("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ questionId: "q-1" }));
    expect(res.status).toBe(400);
  });

  test("returns 404 when the question does not exist", async () => {
    mockQuestionFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ questionId: "q-1", subItemId: "sub-1", sessionId: "sess-1" }));
    expect(res.status).toBe(404);
  });

  test("flags the question and invalidates the active answer", async () => {
    const res = await POST(makeRequest({ questionId: "q-1", subItemId: "sub-1", sessionId: "sess-1" }));
    expect(res.status).toBe(200);

    expect(mockQuestionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "q-1" },
        data: expect.objectContaining({
          flaggedByUserId: "user-1",
          flaggedSessionId: "sess-1",
        }),
      })
    );

    expect(mockAnswerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ans-1" },
        data: expect.objectContaining({
          invalidationReason: expect.any(String),
        }),
      })
    );

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.answerInvalidated).toBe(true);
    expect(body.stats.totalCount).toBe(0);
  });

  test("returns auth response when the user is not authenticated", async () => {
    mockRequireUser.mockResolvedValue(new NextResponse(null, { status: 401 }));
    const res = await POST(makeRequest({ questionId: "q-1", subItemId: "sub-1", sessionId: "sess-1" }));
    expect(res.status).toBe(401);
  });
});
