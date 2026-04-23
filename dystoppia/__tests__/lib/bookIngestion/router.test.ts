/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { extract, OcrNotConfiguredError, UnsupportedFormatError } from "@/lib/bookIngestion/router";
import type { OcrAdapter } from "@/lib/bookIngestion/types";

const encode = (s: string) => new TextEncoder().encode(s);
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);

function stubOcr(configured: boolean, text = "stub"): OcrAdapter {
  return {
    isConfigured: () => configured,
    extractPage: async () => ({ text, confidence: 0.97 }),
  };
}

describe("router.extract", () => {
  it("routes plain text through native extractor", async () => {
    const result = await extract(encode("hello world plain text.\n\nanother paragraph"));
    expect(result.mode).toBe("native");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].source).toBe("native");
    expect(result.needsOcrPages).toEqual([]);
  });

  it("throws UnsupportedFormatError for unrecognized binary", async () => {
    const garbage = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    await expect(extract(garbage)).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("throws OcrNotConfiguredError for images when OCR adapter is absent", async () => {
    await expect(extract(pngHeader)).rejects.toBeInstanceOf(OcrNotConfiguredError);
  });

  it("throws OcrNotConfiguredError for images when adapter reports not configured", async () => {
    await expect(extract(pngHeader, { ocr: stubOcr(false) })).rejects.toBeInstanceOf(
      OcrNotConfiguredError,
    );
  });

  it("routes images through OCR when configured", async () => {
    const result = await extract(pngHeader, { ocr: stubOcr(true, "ocr result here") });
    expect(result.mode).toBe("ocr");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].source).toBe("ocr");
    expect(result.pages[0].text).toBe("ocr result here");
    expect(result.pages[0].confidence).toBeCloseTo(0.97);
  });
});
