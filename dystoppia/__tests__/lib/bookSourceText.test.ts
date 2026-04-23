/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockSubItemFindUnique = vi.hoisted(() => vi.fn());
const mockBookPageFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subItem: { findUnique: mockSubItemFindUnique },
    bookPage: { findMany: mockBookPageFindMany },
  },
}));

import {
  SourceContextAccessError,
  getSourceContextForSubItem,
} from "@/lib/bookSourceText";

beforeEach(() => {
  vi.clearAllMocks();
});

function sourceSubItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    sourceStartPage: 10,
    sourceEndPage: 12,
    item: {
      sourceStartPage: 9,
      sourceEndPage: 13,
      topic: {
        sourceBook: { id: "book-1", title: "Power BI", userId: "user-1" },
      },
    },
    ...overrides,
  };
}

describe("getSourceContextForSubItem", () => {
  test("returns null for regular non-book subitems", async () => {
    mockSubItemFindUnique.mockResolvedValue({
      item: { topic: { sourceBook: null } },
    });

    await expect(getSourceContextForSubItem("user-1", "sub-1")).resolves.toBeNull();
    expect(mockBookPageFindMany).not.toHaveBeenCalled();
  });

  test("denies access when the source book belongs to another user", async () => {
    mockSubItemFindUnique.mockResolvedValue(
      sourceSubItem({
        item: {
          sourceStartPage: 10,
          sourceEndPage: 12,
          topic: { sourceBook: { id: "book-1", title: "Power BI", userId: "other" } },
        },
      }),
    );

    await expect(getSourceContextForSubItem("user-1", "sub-1")).rejects.toBeInstanceOf(
      SourceContextAccessError,
    );
  });

  test("fetches and labels the exact source page range", async () => {
    mockSubItemFindUnique.mockResolvedValue(sourceSubItem());
    mockBookPageFindMany.mockResolvedValue([
      { pageNumber: 10, text: "First source page." },
      { pageNumber: 11, text: "Second source page." },
      { pageNumber: 12, text: "Third source page." },
    ]);

    const context = await getSourceContextForSubItem("user-1", "sub-1");

    expect(mockBookPageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bookId: "book-1",
          pageNumber: { gte: 10, lte: 12 },
        },
      }),
    );
    expect(context).toMatchObject({
      bookId: "book-1",
      bookTitle: "Power BI",
      pageStart: 10,
      pageEnd: 12,
    });
    expect(context?.text).toContain("[Page 10]");
    expect(context?.text).toContain("Third source page.");
  });

  test("falls back to item page range when subitem range is missing", async () => {
    mockSubItemFindUnique.mockResolvedValue(
      sourceSubItem({ sourceStartPage: null, sourceEndPage: null }),
    );
    mockBookPageFindMany.mockResolvedValue([{ pageNumber: 9, text: "Fallback text." }]);

    const context = await getSourceContextForSubItem("user-1", "sub-1");

    expect(mockBookPageFindMany.mock.calls[0][0].where.pageNumber).toEqual({ gte: 9, lte: 13 });
    expect(context?.text).toContain("Fallback text.");
  });
});
