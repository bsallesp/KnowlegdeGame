/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));

const mockCreateStudyTopicFromBook = vi.hoisted(() => vi.fn());
const MockBookNotReadyError = vi.hoisted(() =>
  class BookNotReadyError extends Error {
    constructor() {
      super("book_not_ready");
      this.name = "BookNotReadyError";
    }
  },
);
vi.mock("@/lib/bookStudy", () => ({
  BookNotReadyError: MockBookNotReadyError,
  createStudyTopicFromBook: mockCreateStudyTopicFromBook,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/books/[id]/to-topic/route";

function req() {
  return new NextRequest("http://localhost/api/books/book-1/to-topic", { method: "POST" });
}

function ctx(id = "book-1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
});

describe("POST /api/books/[id]/to-topic", () => {
  test("creates a study topic for the authenticated user's book", async () => {
    mockCreateStudyTopicFromBook.mockResolvedValue({
      created: true,
      topic: { id: "topic-1", name: "Book", slug: "book-book-1", createdAt: new Date().toISOString(), teachingProfile: null, items: [] },
    });

    const res = await POST(req(), ctx());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.topic.id).toBe("topic-1");
    expect(mockCreateStudyTopicFromBook).toHaveBeenCalledWith("user-1", "book-1");
  });

  test("returns existing topic with 200", async () => {
    mockCreateStudyTopicFromBook.mockResolvedValue({
      created: false,
      topic: { id: "topic-existing", name: "Book", slug: "book-book-1", createdAt: new Date().toISOString(), teachingProfile: null, items: [] },
    });

    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
  });

  test("returns 404 for books outside the user's ownership", async () => {
    mockCreateStudyTopicFromBook.mockResolvedValue(null);
    const res = await POST(req(), ctx("other-book"));
    expect(res.status).toBe(404);
  });

  test("returns 409 for books not ready for study", async () => {
    mockCreateStudyTopicFromBook.mockRejectedValue(new MockBookNotReadyError());
    const res = await POST(req(), ctx());
    expect(res.status).toBe(409);
  });

  test("requires authentication", async () => {
    mockRequireUser.mockResolvedValue(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(mockCreateStudyTopicFromBook).not.toHaveBeenCalled();
  });
});
