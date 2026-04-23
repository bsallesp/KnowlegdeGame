import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { extractForMime, createAzureDocumentIntelligenceAdapter } from "@/lib/bookIngestion";
import type { BookMimeType, ExtractedChapter, ExtractionResult } from "@/lib/bookIngestion";
import { detectMimeType } from "@/lib/bookIngestion/detect";
import { createLocalFileStorage, sha256Hex, type BookStorage } from "@/lib/bookStorage";

// Domain orchestrator: extraction + storage + Prisma writes live here so route handlers stay thin.
// The pure `bookIngestion` library knows nothing about Prisma or the filesystem — everything dirty passes through here.

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

  const book = await prisma.book.create({
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
      chapters: {
        create: flattenChapters(extraction.chapters),
      },
    },
    select: { id: true, title: true, pageCount: true, status: true, extractionMode: true },
  });

  logger.info("bookService", "Book ingested", {
    id: book.id,
    pages: extraction.pages.length,
    chapters: extraction.chapters.length,
    mode: extraction.mode,
  });

  return book;
}

function flattenChapters(chapters: ExtractedChapter[]): Array<{
  title: string;
  order: number;
  startPage: number;
  endPage: number | null;
}> {
  const flat: Array<{ title: string; order: number; startPage: number; endPage: number | null }> = [];
  const walk = (nodes: ExtractedChapter[]) => {
    for (const node of nodes) {
      flat.push({
        title: node.title,
        order: node.order,
        startPage: node.startPage,
        endPage: node.endPage ?? null,
      });
      if (node.children) walk(node.children);
    }
  };
  walk(chapters);
  return flat;
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
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    mimeType: book.mimeType,
    pageCount: book.pageCount,
    status: book.status,
    extractionMode: book.extractionMode,
    createdAt: book.createdAt,
    chapters: book.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      startPage: c.startPage,
      endPage: c.endPage,
    })),
  };
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
