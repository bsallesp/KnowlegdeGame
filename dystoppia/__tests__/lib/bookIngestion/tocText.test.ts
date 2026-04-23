/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { parseTextualToc } from "@/lib/bookIngestion/tocText";
import type { ExtractedPage } from "@/lib/bookIngestion/types";

function page(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, source: "native" };
}

describe("parseTextualToc", () => {
  it("extracts top-level entries from a leader-dot TOC", () => {
    const toc = [
      "Contents",
      "",
      "Preface ...................... 1",
      "Chapter 1: Introduction ...................... 5",
      "Chapter 2: Foundations ...................... 40",
      "Chapter 3: Applications ...................... 80",
      "Appendix A: Glossary ...................... 120",
    ].join("\n");

    const result = parseTextualToc([page(1, toc)], { pageCount: 200 });

    expect(result.map((c) => [c.title, c.startPage])).toEqual([
      ["Preface", 1],
      ["Chapter 1: Introduction", 5],
      ["Chapter 2: Foundations", 40],
      ["Chapter 3: Applications", 80],
      ["Appendix A: Glossary", 120],
    ]);
    expect(result.every((c) => !c.children)).toBe(true);
  });

  it("infers a two-level hierarchy from N.M prefixes", () => {
    const toc = [
      "Chapter 1: Basics .......... 1",
      "1.1 Setup .......... 2",
      "1.2 Hello World .......... 5",
      "Chapter 2: Advanced .......... 20",
      "2.1 Patterns .......... 21",
      "2.2 Pitfalls .......... 28",
    ].join("\n");

    const result = parseTextualToc([page(1, toc)], { pageCount: 40 });

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Chapter 1: Basics");
    expect(result[0].children?.map((c) => c.title)).toEqual(["1.1 Setup", "1.2 Hello World"]);
    expect(result[1].title).toBe("Chapter 2: Advanced");
    expect(result[1].children?.map((c) => c.title)).toEqual(["2.1 Patterns", "2.2 Pitfalls"]);
  });

  it("returns empty when the page has fewer than the minimum entries", () => {
    const sparse = "Intro .......... 1\nNothing else to see here.";
    expect(parseTextualToc([page(1, sparse)], { pageCount: 50 })).toEqual([]);
  });

  it("returns empty when no TOC-like lines exist", () => {
    const body = "This is ordinary prose. It has no leader dots or page numbers at line end.";
    expect(parseTextualToc([page(1, body)], { pageCount: 50 })).toEqual([]);
  });

  it("aligns declared page numbers against where titles actually appear in the body", () => {
    const toc = [
      "Chapter 1: Alpha .......... 1",
      "Chapter 2: Beta .......... 10",
      "Chapter 3: Gamma .......... 20",
      "Chapter 4: Delta .......... 30",
    ].join("\n");

    const pages: ExtractedPage[] = [
      page(1, toc),
      page(2, "front matter"),
      page(3, "more front matter"),
      page(4, "preface text"),
      page(5, "Chapter 1: Alpha\nAlpha begins here."),
      page(14, "Chapter 2: Beta\nBeta begins."),
      page(24, "Chapter 3: Gamma\nGamma begins."),
      page(34, "Chapter 4: Delta\nDelta begins."),
    ];
    // Pad with empty pages so the search window covers them.
    while (pages.length < 50) pages.push(page(pages.length + 1, ""));

    const result = parseTextualToc(pages, { pageCount: 50 });
    expect(result.map((c) => [c.title, c.startPage])).toEqual([
      ["Chapter 1: Alpha", 5],
      ["Chapter 2: Beta", 14],
      ["Chapter 3: Gamma", 24],
      ["Chapter 4: Delta", 34],
    ]);
  });
});
