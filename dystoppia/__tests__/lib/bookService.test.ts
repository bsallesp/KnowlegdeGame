/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockBookFindUnique = vi.hoisted(() => vi.fn());
const mockBookFindFirst = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockTxBookCreate = vi.hoisted(() => vi.fn());
const mockTxChapterCreate = vi.hoisted(() => vi.fn());
const mockExtractForMime = vi.hoisted(() => vi.fn());
const mockDetectMimeType = vi.hoisted(() => vi.fn());
const mockStoragePut = vi.hoisted(() => vi.fn());
const mockStorageDelete = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    book: {
      findUnique: mockBookFindUnique,
      findFirst: mockBookFindFirst,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/bookIngestion", () => ({
  createAzureDocumentIntelligenceAdapter: vi.fn(() => undefined),
  extractForMime: mockExtractForMime,
}));

vi.mock("@/lib/bookIngestion/detect", () => ({
  detectMimeType: mockDetectMimeType,
}));

vi.mock("@/lib/bookStorage", () => ({
  createLocalFileStorage: vi.fn(() => ({
    put: mockStoragePut,
    delete: mockStorageDelete,
  })),
  sha256Hex: vi.fn(() => "a".repeat(64)),
}));

import { getBook, ingestBook } from "@/lib/bookService";

beforeEach(() => {
  vi.clearAllMocks();

  let chapterId = 0;
  const tx = {
    book: { create: mockTxBookCreate },
    bookChapter: { create: mockTxChapterCreate },
  };

  mockBookFindUnique.mockResolvedValue(null);
  mockDetectMimeType.mockReturnValue("application/pdf");
  mockStoragePut.mockResolvedValue("local://book.pdf");
  mockTxBookCreate.mockResolvedValue({
    id: "book-1",
    title: "Nested Source",
    pageCount: 12,
    status: "ready",
    extractionMode: "native",
  });
  mockTxChapterCreate.mockImplementation(async () => ({ id: `chapter-${++chapterId}` }));
  mockTransaction.mockImplementation(async (callback: (txClient: typeof tx) => Promise<unknown>) =>
    callback(tx),
  );
  mockExtractForMime.mockResolvedValue({
    mode: "native",
    pages: [{ pageNumber: 1, text: "source text", source: "native" }],
    chapters: [
      {
        title: "Chapter 1",
        order: 0,
        startPage: 1,
        children: [
          { title: "1.1 Setup", order: 0, startPage: 1 },
          { title: "1.2 Workflow", order: 1, startPage: 7 },
        ],
      },
    ],
    needsOcrPages: [],
  });
});

describe("bookService", () => {
  test("ingestBook persists extracted chapter hierarchy with parentId", async () => {
    await ingestBook({
      userId: "user-1",
      title: "Nested Source",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });

    expect(mockTxChapterCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Chapter 1",
          parentId: null,
        }),
      }),
    );
    expect(mockTxChapterCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          title: "1.1 Setup",
          parentId: "chapter-1",
        }),
      }),
    );
    expect(mockTxChapterCreate).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          title: "1.2 Workflow",
          parentId: "chapter-1",
        }),
      }),
    );
  });

  test("getBook returns flat chapters in DFS order with parentId", async () => {
    mockBookFindFirst.mockResolvedValue({
      id: "book-1",
      title: "Nested Source",
      author: null,
      mimeType: "application/pdf",
      pageCount: 12,
      status: "ready",
      extractionMode: "native",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      chapters: [
        { id: "child-2", parentId: "root-1", title: "1.2 Workflow", order: 1, startPage: 7, endPage: null },
        { id: "root-1", parentId: null, title: "Chapter 1", order: 0, startPage: 1, endPage: null },
        { id: "child-1", parentId: "root-1", title: "1.1 Setup", order: 0, startPage: 1, endPage: null },
      ],
    });

    const book = await getBook("user-1", "book-1");

    expect(book?.chapters.map((c) => [c.id, c.parentId])).toEqual([
      ["root-1", null],
      ["child-1", "root-1"],
      ["child-2", "root-1"],
    ]);
  });
});
