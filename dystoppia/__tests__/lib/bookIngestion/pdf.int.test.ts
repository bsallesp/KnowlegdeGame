/**
 * Optional integration test: real PDF extraction against a file on disk.
 * Skipped unless TEST_PDF_PATH points to a PDF.
 *
 * @vitest-environment node
 */
import { describe, test, expect } from "vitest";
import { promises as fs } from "fs";
import { extractPdf } from "@/lib/bookIngestion/pdf";
import { detectMimeType } from "@/lib/bookIngestion/detect";

const fixturePath = process.env.TEST_PDF_PATH;

describe.skipIf(!fixturePath)("integration: real PDF extraction", () => {
  test("extracts pages and chapters from a real PDF", async () => {
    const buf = await fs.readFile(fixturePath!);
    const bytes = new Uint8Array(buf);
    expect(detectMimeType(bytes)).toBe("application/pdf");

    const result = await extractPdf(bytes);

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.nativeTextRatio).toBeGreaterThan(0);

    const pagesWithText = result.pages.filter((p) => p.text.length > 0);
    expect(pagesWithText.length).toBeGreaterThan(0);

    console.log(
      `[pdf.int] pages=${result.pages.length} withText=${pagesWithText.length} ` +
        `nativeRatio=${result.nativeTextRatio.toFixed(3)} chapters=${result.chapters.length} ` +
        `needsOcr=${result.needsOcrPages.length}`,
    );
    if (result.chapters.length > 0) {
      console.log(
        `[pdf.int] first chapters:`,
        result.chapters.slice(0, 5).map((c) => `${c.title}@p${c.startPage}`).join(" | "),
      );
    }
    const sample = pagesWithText[0];
    console.log(`[pdf.int] page ${sample.pageNumber} first 200 chars:`, sample.text.slice(0, 200));
  }, 120_000);
});
