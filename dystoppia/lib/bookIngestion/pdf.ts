import type { ExtractedChapter, ExtractedPage } from "./types";

export interface PdfExtraction {
  pages: ExtractedPage[];
  chapters: ExtractedChapter[];
  needsOcrPages: number[];
  nativeTextRatio: number;
}

// Below this char count we treat a page as "no native text layer" and mark it for OCR.
const MIN_TEXT_CHARS = 20;

type PdfTextItem = { str?: string };
type PdfOutlineNode = {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineNode[];
};
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }> }>;
  getOutline: () => Promise<PdfOutlineNode[] | null>;
  getDestination: (name: string) => Promise<unknown>;
  getPageIndex: (ref: unknown) => Promise<number>;
  cleanup: () => Promise<void>;
  destroy: () => Promise<void>;
};
type PdfJsModule = {
  getDocument: (opts: { data: Uint8Array; useSystemFonts?: boolean }) => { promise: Promise<PdfDoc> };
};

async function loadPdfJs(): Promise<PdfJsModule> {
  // Legacy build is the Node-compatible ESM entrypoint.
  const mod = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
  return mod;
}

export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;

  try {
    const { pages, needsOcrPages, hasTextCount } = await extractPages(doc);
    const chapters = await extractOutline(doc);
    return {
      pages,
      chapters,
      needsOcrPages,
      nativeTextRatio: doc.numPages === 0 ? 0 : hasTextCount / doc.numPages,
    };
  } finally {
    await doc.cleanup().catch(() => {});
    await doc.destroy().catch(() => {});
  }
}

async function extractPages(doc: PdfDoc) {
  const pages: ExtractedPage[] = [];
  const needsOcrPages: number[] = [];
  let hasTextCount = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = normalizeText(content.items.map((it) => it.str ?? "").join(" "));

    if (text.length >= MIN_TEXT_CHARS) {
      hasTextCount++;
      pages.push({ pageNumber: i, text, source: "native" });
    } else {
      needsOcrPages.push(i);
      pages.push({ pageNumber: i, text: "", source: "native" });
    }
  }
  return { pages, needsOcrPages, hasTextCount };
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

async function extractOutline(doc: PdfDoc): Promise<ExtractedChapter[]> {
  let outline: PdfOutlineNode[] | null = null;
  try {
    outline = await doc.getOutline();
  } catch {
    outline = null;
  }
  if (!outline || outline.length === 0) return [];

  const counter = { n: 0 };
  return walkOutline(doc, outline, counter);
}

async function walkOutline(
  doc: PdfDoc,
  nodes: PdfOutlineNode[],
  counter: { n: number },
): Promise<ExtractedChapter[]> {
  const result: ExtractedChapter[] = [];
  for (const node of nodes) {
    const startPage = await resolveDestPage(doc, node.dest);
    const children =
      node.items && node.items.length > 0 ? await walkOutline(doc, node.items, counter) : undefined;
    result.push({
      title: String(node.title ?? "Untitled").replace(/\s+/g, " ").trim() || "Untitled",
      order: counter.n++,
      startPage: startPage ?? 1,
      children,
    });
  }
  return result;
}

async function resolveDestPage(doc: PdfDoc, dest: unknown): Promise<number | null> {
  if (dest === null || dest === undefined) return null;
  try {
    const destArray = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(destArray) || destArray.length === 0) return null;
    const pageIndex = await doc.getPageIndex(destArray[0]);
    return pageIndex + 1;
  } catch {
    return null;
  }
}
