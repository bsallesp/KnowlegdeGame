import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { extractForMime, createAzureDocumentIntelligenceAdapter } from "@/lib/bookIngestion";
import type { BookMimeType, ExtractedChapter, ExtractionResult } from "@/lib/bookIngestion";
import { detectMimeType } from "@/lib/bookIngestion/detect";
import { createLocalFileStorage, sha256Hex, type BookStorage } from "@/lib/bookStorage";

// Domain orchestrator: extraction + storage + Prisma writes live here so route handlers stay thin.
// The pure `bookIngestion` library knows nothing about Prisma or the filesystem.

export interface IngestInput {
  userId: string;
  title: string;
  bytes: Uint8Array;
}

export interface IngestedBook {
  id: string;
  title: string;
  pageCount: number;
  status: string;
  extractionMode: string | null;
}

let storageSingleton: BookStorage | null = null;
function getStorage(): BookStorage {
  if (!storageSingleton) storageSingleton = createLocalFileStorage();
  return storageSingleton;
}

export class DuplicateBookError extends Error {
  constructor(public readonly existingId: string) {
    super("duplicate_book");
    this.name = "DuplicateBookError";
  }
}

export class UnsupportedBookFormatError extends Error {
  constructor(public readonly mimeType: string) {
    super(`unsupported_format:${mimeType}`);
    this.name = "UnsupportedBookFormatError";
  }
}

export async function ingestBook(input: IngestInput): Promise<IngestedBook> {
  const { userId, title, bytes } = input;
  const sha256 = sha256Hex(bytes);

  const existing = await prisma.book.findUnique({
    where: { userId_sha256: { userId, sha256 } },
    select: { id: true },
  });
  if (existing) throw new DuplicateBookError(existing.id);

  const mime = detectMimeType(bytes);
  if (mime === "unknown") throw new UnsupportedBookFormatError(mime);

  const storage = getStorage();
  const sourceUri = await storage.put(userId, sha256, bytes);
  logger.info("bookService", `Stored book bytes`, { userId, sha256, uri: sourceUri });

  let extraction: ExtractionResult;
  try {
    extraction = await extractForMime(bytes, mime, {
      ocr: createAzureDocumentIntelligenceAdapter(),
    });
  } catch (err) {
    logger.error("bookService", "Extraction failed", err);
    await storage.delete(sourceUri).catch(() => {});
    throw err;
  }

  let book: IngestedBook;
  try {
    book = await prisma.$transaction(
      async (tx) => {
        const created = await tx.book.create({
          data: {
            userId,
            title,
            mimeType: mime,
            sha256,
            sourceUri,
            sizeBytes: bytes.byteLength,
            pageCount: extraction.pages.length,
            status: "ready",
            extractionMode: extraction.mode,
            pages: {
              create: extraction.pages.map((p) => ({
                pageNumber: p.pageNumber,
                text: p.text,
                charCount: p.text.length,
                source: p.source,
                confidence: p.confidence,
              })),
            },
          },
          select: { id: true, title: true, pageCount: true, status: true, extractionMode: true },
        });
        await writeChapterTree(tx, created.id, extraction.chapters, null);
        return created;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (err) {
    logger.error("bookService", "Persistence failed", err);
    await storage.delete(sourceUri).catch(() => {});
    throw err;
  }

  logger.info("bookService", "Book ingested", {
    id: book.id,
    pages: extraction.pages.length,
    chapters: countChapters(extraction.chapters),
    mode: extraction.mode,
  });

  return book;
}

// Chapters are persisted as a tree via parentId. We write level-by-level so each child
// can reference its parent's generated id. Sequential writes are fine for typical
// book sizes (50-200 TOC nodes) and the enclosing transaction keeps it atomic.
async function writeChapterTree(
  tx: Prisma.TransactionClient,
  bookId: string,
  nodes: ExtractedChapter[],
  parentId: string | null,
): Promise<void> {
  for (const node of nodes) {
    const created = await tx.bookChapter.create({
      data: {
        bookId,
        parentId,
        title: node.title,
        order: node.order,
        startPage: node.startPage,
        endPage: node.endPage ?? null,
      },
      select: { id: true },
    });
    if (node.children && node.children.length > 0) {
      await writeChapterTree(tx, bookId, node.children, created.id);
    }
  }
}

function countChapters(nodes: ExtractedChapter[]): number {
  let total = 0;
  const walk = (ns: ExtractedChapter[]) => {
    for (const n of ns) {
      total++;
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return total;
}

export async function listBooks(userId: string) {
  return prisma.book.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      mimeType: true,
      pageCount: true,
      status: true,
      extractionMode: true,
      createdAt: true,
    },
  });
}

export async function getBook(userId: string, id: string) {
  const book = await prisma.book.findFirst({
    where: { id, userId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  if (!book) return null;
  // Return chapters in DFS order so nested children follow their parent in the flat list,
  // which matches how a reader would traverse a TOC top-to-bottom.
  const chapters = sortChaptersDfs(book.chapters);
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    mimeType: book.mimeType,
    pageCount: book.pageCount,
    status: book.status,
    extractionMode: book.extractionMode,
    createdAt: book.createdAt,
    chapters: chapters.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      title: c.title,
      order: c.order,
      startPage: c.startPage,
      endPage: c.endPage,
    })),
  };
}

type FlatChapter = {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
};

function sortChaptersDfs<T extends FlatChapter>(chapters: T[]): T[] {
  const byParent = new Map<string | null, T[]>();
  for (const c of chapters) {
    const key = c.parentId ?? null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(c);
    else byParent.set(key, [c]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

  const result: T[] = [];
  const walk = (parentId: string | null) => {
    for (const c of byParent.get(parentId) ?? []) {
      result.push(c);
      walk(c.id);
    }
  };
  walk(null);
  return result;
}

export async function getBookPage(userId: string, id: string, pageNumber: number) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  const owner = await prisma.book.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owner) return null;
  const page = await prisma.bookPage.findUnique({
    where: { bookId_pageNumber: { bookId: id, pageNumber } },
    select: { pageNumber: true, text: true, source: true, confidence: true, charCount: true },
  });
  return page;
}

export function isAcceptableMime(mime: string): mime is BookMimeType {
  return (
    mime === "application/pdf" ||
    mime === "application/epub+zip" ||
    mime === "text/plain" ||
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/webp" ||
    mime === "image/tiff"
  );
}
