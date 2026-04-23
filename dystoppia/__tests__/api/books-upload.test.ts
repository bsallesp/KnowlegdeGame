/**
 * @vitest-environment node
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

const mockRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockBookFindUnique = vi.hoisted(() => vi.fn());
const mockBookCreate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    book: { findUnique: mockBookFindUnique, create: mockBookCreate },
  },
}));

// Avoid hitting Azure DI in tests.
vi.mock("@/lib/bookIngestion/ocr", () => ({
  createAzureDocumentIntelligenceAdapter: () => ({
    isConfigured: () => false,
    extractPage: async () => ({ text: "" }),
  }),
}));

let tmpRoot: string;
vi.mock("@/lib/bookStorage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bookStorage")>("@/lib/bookStorage");
  return {
    ...actual,
    createLocalFileStorage: () => actual.createLocalFileStorage(tmpRoot),
  };
});

import { POST } from "@/app/api/books/upload/route";

function makeReq(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/books/upload", {
    method: "POST",
    body: form,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "book-upload-test-"));
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockBookFindUnique.mockResolvedValue(null);
  mockBookCreate.mockImplementation(async (args) => ({
    id: "book-1",
    title: args.data.title,
    pageCount: args.data.pageCount,
    status: args.data.status,
    extractionMode: args.data.extractionMode,
  }));
});

describe("POST /api/books/upload", () => {
  test("rejects non-multipart requests", async () => {
    const req = new NextRequest("http://localhost/api/books/upload", {
      method: "POST",
      body: JSON.stringify({ x: 1 }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("expected_multipart_form_data");
  });

  test("rejects when file field is missing", async () => {
    const form = new FormData();
    form.set("title", "x");
    const res = await POST(makeReq(form));
    expect(res.status).toBe(400);
  });

  test("rejects empty files", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([])], "empty.txt", { type: "text/plain" }));
    const res = await POST(makeReq(form));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("file_empty");
  });

  test("ingests a plain text file", async () => {
    const form = new FormData();
    const bytes = new TextEncoder().encode("Chapter 1\n\nThis is some readable text.");
    form.set("file", new File([bytes], "book.txt", { type: "text/plain" }));
    form.set("title", "Test Book");

    const res = await POST(makeReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.book.id).toBe("book-1");
    expect(mockBookCreate).toHaveBeenCalledTimes(1);
    const created = mockBookCreate.mock.calls[0][0].data;
    expect(created.userId).toBe("user-1");
    expect(created.mimeType).toBe("text/plain");
    expect(created.status).toBe("ready");
    expect(created.pages.create.length).toBeGreaterThan(0);
  });

  test("returns 409 on duplicate sha256 for the same user", async () => {
    mockBookFindUnique.mockResolvedValueOnce({ id: "existing-book" });
    const form = new FormData();
    form.set(
      "file",
      new File([new TextEncoder().encode("already uploaded content")], "dup.txt", { type: "text/plain" }),
    );
    const res = await POST(makeReq(form));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("duplicate_book");
    expect(body.existingId).toBe("existing-book");
    expect(mockBookCreate).not.toHaveBeenCalled();
  });

  test("returns 503 when OCR needed but not configured (image upload)", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const form = new FormData();
    form.set("file", new File([png], "scan.png", { type: "image/png" }));
    const res = await POST(makeReq(form));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("ocr_not_configured");
  });

  test("returns 415 for unsupported formats", async () => {
    const garbage = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const form = new FormData();
    form.set("file", new File([garbage], "mystery.bin", { type: "application/octet-stream" }));
    const res = await POST(makeReq(form));
    expect(res.status).toBe(415);
  });

  test("requires authentication", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUser.mockResolvedValueOnce(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "x.pdf", { type: "application/pdf" }));
    const res = await POST(makeReq(form));
    expect(res.status).toBe(401);
  });
});
