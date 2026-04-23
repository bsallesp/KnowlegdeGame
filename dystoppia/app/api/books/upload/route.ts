import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authGuard";
import { logger } from "@/lib/logger";
import {
  DuplicateBookError,
  UnsupportedBookFormatError,
  ingestBook,
} from "@/lib/bookService";
import { OcrNotConfiguredError, UnsupportedFormatError } from "@/lib/bookIngestion";

export const runtime = "nodejs";
// Large payloads for books — pdfjs/yauzl need Node, not the edge runtime.

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB hard cap

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "expected_multipart_form_data" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    logger.warn("books/upload", "formData parse failed", err);
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_field_required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file_empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", max: MAX_UPLOAD_BYTES, received: file.size },
      { status: 413 },
    );
  }

  const titleField = form.get("title");
  const title =
    typeof titleField === "string" && titleField.trim().length > 0
      ? titleField.trim().slice(0, 300)
      : file.name.replace(/\.[^.]+$/, "").slice(0, 300) || "Untitled";

  const bytes = new Uint8Array(await file.arrayBuffer());
  logger.info("books/upload", "Ingesting book", { userId: auth.userId, bytes: bytes.length, title });

  try {
    const book = await ingestBook({ userId: auth.userId, title, bytes });
    return NextResponse.json({ book }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateBookError) {
      return NextResponse.json({ error: "duplicate_book", existingId: err.existingId }, { status: 409 });
    }
    if (err instanceof UnsupportedBookFormatError || err instanceof UnsupportedFormatError) {
      return NextResponse.json({ error: "unsupported_format" }, { status: 415 });
    }
    if (err instanceof OcrNotConfiguredError) {
      return NextResponse.json(
        {
          error: "ocr_not_configured",
          message:
            "This file needs OCR (image or scanned PDF). Configure AZURE_DI_ENDPOINT and AZURE_DI_KEY to enable.",
        },
        { status: 503 },
      );
    }
    logger.error("books/upload", "Ingestion failed", err);
    return NextResponse.json({ error: "ingestion_failed", message: String(err) }, { status: 500 });
  }
}
