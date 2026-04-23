/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { chunkPages } from "@/lib/bookIngestion/chunk";
import type { ExtractedPage } from "@/lib/bookIngestion/types";

const page = (pageNumber: number, text: string): ExtractedPage => ({
  pageNumber,
  text,
  source: "native",
});

describe("chunkPages", () => {
  it("returns no chunks for empty pages", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages([page(1, "")])).toEqual([]);
  });

  it("fits all text in one chunk when under target", () => {
    const chunks = chunkPages([page(1, "Hello world. This is a short book."), page(2, "Second page text.")]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(2);
    expect(chunks[0].text).toContain("Hello world");
    expect(chunks[0].text).toContain("Second page text");
  });

  it("splits into multiple chunks when over target size", () => {
    const long = "This is a sentence. ".repeat(200);
    const chunks = chunkPages([page(1, long)], { targetChars: 500, overlapChars: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.charCount).toBeGreaterThan(0);
  });

  it("tracks page ranges across chunks", () => {
    const chunks = chunkPages(
      [page(1, "Sentence one. ".repeat(40)), page(2, "Sentence two. ".repeat(40))],
      { targetChars: 200, overlapChars: 0 },
    );
    const allPages = chunks.flatMap((c) => [c.pageStart, c.pageEnd]);
    expect(Math.min(...allPages)).toBe(1);
    expect(Math.max(...allPages)).toBe(2);
  });

  it("produces overlap between consecutive chunks when overlapChars > 0", () => {
    const long = "Alpha beta gamma. ".repeat(100);
    const chunks = chunkPages([page(1, long)], { targetChars: 200, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    const tail = chunks[0].text.slice(-20);
    expect(chunks[1].text).toContain(tail.slice(0, 10));
  });
});
