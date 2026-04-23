import type { ExtractedPage } from "./types";

export interface TextExtraction {
  pages: ExtractedPage[];
}

// Split plain text into synthetic pages of ~CHARS_PER_PAGE, aligned to paragraph boundaries.
const CHARS_PER_PAGE = 3000;

export function extractText(bytes: Uint8Array): TextExtraction {
  const raw = new TextDecoder("utf-8").decode(bytes).trim();
  if (raw.length === 0) return { pages: [] };

  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pages: ExtractedPage[] = [];

  let buffer = "";
  let pageNumber = 1;
  const flush = () => {
    if (buffer.length === 0) return;
    pages.push({ pageNumber: pageNumber++, text: buffer.trim(), source: "native" });
    buffer = "";
  };

  for (const p of paragraphs) {
    if (buffer.length + p.length + 2 > CHARS_PER_PAGE && buffer.length > 0) flush();
    buffer += (buffer ? "\n\n" : "") + p;
  }
  flush();

  return { pages };
}
