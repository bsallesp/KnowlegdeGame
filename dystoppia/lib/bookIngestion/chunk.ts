import type { ExtractedPage } from "./types";

export interface TextChunk {
  text: string;
  pageStart: number;
  pageEnd: number;
  charCount: number;
}

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
}

// Build chunks that stay within page boundaries as much as possible and break at sentence/paragraph marks.
// Used later by question generation and embeddings. Kept boundary-aware so each chunk is traceable to a page range.
export function chunkPages(pages: ExtractedPage[], opts: ChunkOptions = {}): TextChunk[] {
  const targetChars = opts.targetChars ?? 1800;
  const overlapChars = opts.overlapChars ?? 150;
  const chunks: TextChunk[] = [];

  let buffer = "";
  let bufferStartPage = pages[0]?.pageNumber ?? 1;
  let bufferEndPage = bufferStartPage;

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length === 0) return;
    chunks.push({
      text: trimmed,
      pageStart: bufferStartPage,
      pageEnd: bufferEndPage,
      charCount: trimmed.length,
    });
    buffer = overlapChars > 0 ? tail(trimmed, overlapChars) : "";
    bufferStartPage = bufferEndPage;
  };

  for (const page of pages) {
    if (page.text.length === 0) continue;
    if (buffer.length === 0) bufferStartPage = page.pageNumber;
    bufferEndPage = page.pageNumber;

    const pieces = splitIntoSentences(page.text);
    for (const piece of pieces) {
      if (buffer.length + piece.length + 1 > targetChars && buffer.length >= overlapChars) flush();
      buffer += (buffer.length > 0 && !/\s$/.test(buffer) ? " " : "") + piece;
    }
  }
  flush();

  return chunks;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tail(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(s.length - n);
}
