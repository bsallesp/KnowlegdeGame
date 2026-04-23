import { detectMimeType } from "./detect";
import { extractPdf } from "./pdf";
import { extractEpub } from "./epub";
import { extractText } from "./text";
import type { BookMimeType, ExtractionMode, ExtractionResult, OcrAdapter } from "./types";

export interface ExtractOptions {
  ocr?: OcrAdapter;
  // If the fraction of pages with a native text layer is below this, route the whole file through OCR.
  nativeTextFloor?: number;
}

export class UnsupportedFormatError extends Error {
  constructor(public readonly mimeType: BookMimeType) {
    super(`unsupported_format:${mimeType}`);
    this.name = "UnsupportedFormatError";
  }
}

export class OcrNotConfiguredError extends Error {
  constructor() {
    super("ocr_not_configured");
    this.name = "OcrNotConfiguredError";
  }
}

export async function extract(bytes: Uint8Array, opts: ExtractOptions = {}): Promise<ExtractionResult> {
  const mime = detectMimeType(bytes);
  return extractForMime(bytes, mime, opts);
}

export async function extractForMime(
  bytes: Uint8Array,
  mime: BookMimeType,
  opts: ExtractOptions = {},
): Promise<ExtractionResult> {
  const nativeTextFloor = opts.nativeTextFloor ?? 0.5;

  if (mime === "text/plain") {
    const { pages } = extractText(bytes);
    return { pages, chapters: [], needsOcrPages: [], mode: "native" };
  }

  if (mime === "application/epub+zip") {
    const { pages, chapters } = await extractEpub(bytes);
    return { pages, chapters, needsOcrPages: [], mode: "native" };
  }

  if (mime === "application/pdf") {
    const pdf = await extractPdf(bytes);
    if (pdf.nativeTextRatio >= nativeTextFloor && pdf.needsOcrPages.length === 0) {
      return { pages: pdf.pages, chapters: pdf.chapters, needsOcrPages: [], mode: "native" };
    }
    // Mixed or fully-scanned — needs OCR escalation. Leave PDF page-level OCR to a follow-up
    // (requires rendering pages to images). For now, surface which pages need OCR.
    return {
      pages: pdf.pages,
      chapters: pdf.chapters,
      needsOcrPages: pdf.needsOcrPages,
      mode: pdf.nativeTextRatio > 0 ? "mixed" : "ocr",
    };
  }

  if (isImage(mime)) {
    if (!opts.ocr || !opts.ocr.isConfigured()) throw new OcrNotConfiguredError();
    const { text, confidence } = await opts.ocr.extractPage(bytes, mime);
    return {
      pages: [{ pageNumber: 1, text, source: "ocr", confidence }],
      chapters: [],
      needsOcrPages: [],
      mode: "ocr",
    };
  }

  throw new UnsupportedFormatError(mime);
}

function isImage(mime: BookMimeType): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp" || mime === "image/tiff";
}

export function modeFromPages(pageSources: ExtractionMode[]): ExtractionMode {
  const unique = new Set(pageSources);
  if (unique.size === 1) return [...unique][0];
  return "mixed";
}
