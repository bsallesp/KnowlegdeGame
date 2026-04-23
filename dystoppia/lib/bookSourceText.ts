import { prisma } from "@/lib/prisma";

const DEFAULT_MAX_SOURCE_CHARS = 12_000;

export interface BookSourceContext {
  bookId: string;
  bookTitle: string;
  pageStart: number;
  pageEnd: number;
  text: string;
}

export class SourceContextAccessError extends Error {
  constructor() {
    super("source_context_access_denied");
    this.name = "SourceContextAccessError";
  }
}

export async function getSourceContextForSubItem(
  userId: string,
  subItemId: string,
  maxChars = DEFAULT_MAX_SOURCE_CHARS,
): Promise<BookSourceContext | null> {
  const subItem = await prisma.subItem.findUnique({
    where: { id: subItemId },
    include: {
      item: {
        include: {
          topic: {
            include: {
              sourceBook: { select: { id: true, title: true, userId: true } },
            },
          },
        },
      },
    },
  });

  const sourceBook = subItem?.item.topic.sourceBook;
  if (!subItem || !sourceBook) return null;
  if (sourceBook.userId !== userId) throw new SourceContextAccessError();

  const pageStart = subItem.sourceStartPage ?? subItem.item.sourceStartPage;
  const pageEnd = subItem.sourceEndPage ?? subItem.item.sourceEndPage ?? pageStart;
  if (!pageStart || !pageEnd) return null;

  const pages = await prisma.bookPage.findMany({
    where: {
      bookId: sourceBook.id,
      pageNumber: { gte: pageStart, lte: pageEnd },
    },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, text: true },
  });

  const text = truncateSource(
    pages
      .filter((page) => page.text.trim().length > 0)
      .map((page) => `[Page ${page.pageNumber}]\n${page.text.trim()}`)
      .join("\n\n"),
    maxChars,
  );

  if (!text) return null;
  return {
    bookId: sourceBook.id,
    bookTitle: sourceBook.title,
    pageStart,
    pageEnd,
    text,
  };
}

function truncateSource(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 34)).trimEnd()}\n\n[Source excerpt truncated]`;
}
