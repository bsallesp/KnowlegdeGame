/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { extractText } from "@/lib/bookIngestion/text";

const encode = (s: string) => new TextEncoder().encode(s);

describe("extractText", () => {
  it("returns one page for short content", () => {
    const { pages } = extractText(encode("hello world\n\nsecond paragraph"));
    expect(pages).toHaveLength(1);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].text).toContain("hello world");
    expect(pages[0].text).toContain("second paragraph");
    expect(pages[0].source).toBe("native");
  });

  it("splits content by paragraphs across multiple pages", () => {
    const para = "A".repeat(1500);
    const input = `${para}\n\n${para}\n\n${para}`;
    const { pages } = extractText(encode(input));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[pages.length - 1].pageNumber).toBe(pages.length);
  });

  it("returns empty pages for empty input", () => {
    expect(extractText(encode("")).pages).toEqual([]);
    expect(extractText(encode("   \n\n  ")).pages).toEqual([]);
  });

  it("preserves paragraph separators within a page", () => {
    const { pages } = extractText(encode("line one\n\nline two"));
    expect(pages[0].text).toBe("line one\n\nline two");
  });
});
