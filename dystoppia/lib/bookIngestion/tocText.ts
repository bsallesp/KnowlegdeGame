import type { ExtractedChapter, ExtractedPage } from "./types";

// Fallback TOC extraction for PDFs whose metadata outline is empty or absent.
// Strategy: scan the first pages for printed TOC entries, infer hierarchy from
// common prefixes, then align printed page numbers to actual PDF pages.

const DEFAULT_SCAN_PAGES = 25;
const MIN_ENTRIES_PER_PAGE = 3;
const MIN_TOTAL_ENTRIES = 4;

// "Something ............ 42" is the strongest TOC signal.
const LEADER_DOT_LINE = /^(.+?)\s*\.{2,}[\.\s]*\s*(\d{1,4})\s*$/;
// "1.2 Title ....... 42" or "Chapter 3: Title ...... 42": prefix drives depth.
const CHAPTER_PREFIX = /^\s*(Chapter|Part|Appendix)\s+([IVXLC]+|\d+)\b/i;
const DECIMAL_PREFIX = /^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\b/;

export interface TocCandidate {
  title: string;
  pageNumber: number;
  depth: number;
}

export interface TocParseOptions {
  scanPages?: number;
  pageCount?: number;
}

export function parseTextualToc(
  pages: ExtractedPage[],
  opts: TocParseOptions = {},
): ExtractedChapter[] {
  const scan = Math.min(opts.scanPages ?? DEFAULT_SCAN_PAGES, pages.length);
  const pageCount = opts.pageCount ?? pages.length;
  const { candidates, tocPages } = collectCandidates(pages.slice(0, scan), pageCount);
  if (candidates.length < MIN_TOTAL_ENTRIES) return [];

  const aligned = alignAgainstBody(candidates, pages, tocPages);
  return buildTreeFromCandidates(aligned);
}

function collectCandidates(
  pages: ExtractedPage[],
  pageCount: number,
): { candidates: TocCandidate[]; tocPages: Set<number> } {
  const all: TocCandidate[] = [];
  const tocPages = new Set<number>();

  for (const page of pages) {
    const perPage = extractFromPage(page.text, pageCount);
    if (perPage.length >= MIN_ENTRIES_PER_PAGE) {
      all.push(...perPage);
      tocPages.add(page.pageNumber);
    }
  }

  return { candidates: dedupeByTitle(all), tocPages };
}

function extractFromPage(text: string, pageCount: number): TocCandidate[] {
  const out: TocCandidate[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 4) continue;

    const match = LEADER_DOT_LINE.exec(line);
    if (!match) continue;

    const titlePart = match[1].trim();
    const pageNumber = Number(match[2]);
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || pageNumber > pageCount) continue;
    if (titlePart.length < 2 || titlePart.length > 160) continue;

    out.push({
      title: cleanTitle(titlePart),
      pageNumber,
      depth: inferDepth(titlePart),
    });
  }

  return out;
}

function inferDepth(title: string): number {
  if (CHAPTER_PREFIX.test(title)) return 0;

  const decimal = DECIMAL_PREFIX.exec(title);
  if (decimal) {
    if (decimal[3]) return 2;
    if (decimal[2]) return 1;
    return 0;
  }

  // Stand-alone phrases such as Preface, Introduction, or Appendix A are roots.
  return 0;
}

function dedupeByTitle(candidates: TocCandidate[]): TocCandidate[] {
  const seen = new Set<string>();
  const out: TocCandidate[] = [];

  for (const c of candidates) {
    const key = `${c.title.toLowerCase()}::${c.pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out;
}

// Printed page numbers can be book-internal and lag the PDF page index by the
// length of front matter. We search for title occurrences in the body and apply
// the most common offset when enough candidates agree.
function alignAgainstBody(
  candidates: TocCandidate[],
  pages: ExtractedPage[],
  tocPages: Set<number>,
): TocCandidate[] {
  const byPageNumber = new Map<number, ExtractedPage>();
  let maxPage = 0;

  for (const p of pages) {
    const existing = byPageNumber.get(p.pageNumber);
    if (!existing || (existing.text.length === 0 && p.text.length > 0)) {
      byPageNumber.set(p.pageNumber, p);
    }
    if (p.pageNumber > maxPage) maxPage = p.pageNumber;
  }

  const offsets: number[] = [];
  for (const c of candidates) {
    const actual = findTitlePage(c.title, byPageNumber, maxPage, c.pageNumber, tocPages);
    if (actual !== null) offsets.push(actual - c.pageNumber);
  }

  if (offsets.length < Math.max(2, Math.floor(candidates.length * 0.3))) {
    return candidates;
  }

  const offset = modeInteger(offsets);
  if (offset === 0) return candidates;

  return candidates
    .map((c) => ({ ...c, pageNumber: c.pageNumber + offset }))
    .filter((c) => c.pageNumber >= 1 && c.pageNumber <= maxPage);
}

function findTitlePage(
  title: string,
  byPageNumber: Map<number, ExtractedPage>,
  maxPage: number,
  declaredPage: number,
  tocPages: Set<number>,
): number | null {
  const normalized = normalizeForSearch(title);
  if (normalized.length < 4) return null;

  // TOC pages contain the title followed by leader dots, so skip them to find
  // the body occurrence. Search forward because front matter usually shifts the
  // actual PDF page after the printed page number.
  const start = Math.max(1, declaredPage);
  const end = Math.min(maxPage, declaredPage + 40);

  for (let n = start; n <= end; n++) {
    if (tocPages.has(n)) continue;

    const p = byPageNumber.get(n);
    if (!p) continue;
    if (normalizeForSearch(p.text).includes(normalized)) return n;
  }

  return null;
}

function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function modeInteger(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);

  let best = 0;
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }

  return best;
}

function buildTreeFromCandidates(candidates: TocCandidate[]): ExtractedChapter[] {
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort((a, b) => a.pageNumber - b.pageNumber);
  const roots: ExtractedChapter[] = [];
  const stack: Array<{ depth: number; node: ExtractedChapter }> = [];

  for (const c of sorted) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= c.depth) stack.pop();

    const node: ExtractedChapter = {
      title: c.title,
      order: 0,
      startPage: c.pageNumber,
      children: [],
    };

    if (stack.length === 0) {
      node.order = roots.length;
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      parent.children = parent.children ?? [];
      node.order = parent.children.length;
      parent.children.push(node);
    }

    stack.push({ depth: c.depth, node });
  }

  stripEmptyChildren(roots);
  return roots;
}

function stripEmptyChildren(nodes: ExtractedChapter[]): void {
  for (const n of nodes) {
    if (!n.children || n.children.length === 0) {
      n.children = undefined;
    } else {
      stripEmptyChildren(n.children);
    }
  }
}

function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 160);
}
