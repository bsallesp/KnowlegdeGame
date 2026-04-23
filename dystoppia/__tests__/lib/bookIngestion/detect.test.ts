/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { detectMimeType } from "@/lib/bookIngestion/detect";

const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webpHeader = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const tiffHeaderLe = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]);
const tiffHeaderBe = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0]);

describe("detectMimeType", () => {
  it("detects PDF", () => {
    expect(detectMimeType(pdfHeader)).toBe("application/pdf");
  });

  it("detects ZIP (EPUB)", () => {
    expect(detectMimeType(zipHeader)).toBe("application/epub+zip");
  });

  it("detects PNG", () => {
    expect(detectMimeType(pngHeader)).toBe("image/png");
  });

  it("detects JPEG", () => {
    expect(detectMimeType(jpegHeader)).toBe("image/jpeg");
  });

  it("detects WEBP", () => {
    expect(detectMimeType(webpHeader)).toBe("image/webp");
  });

  it("detects TIFF (LE and BE)", () => {
    expect(detectMimeType(tiffHeaderLe)).toBe("image/tiff");
    expect(detectMimeType(tiffHeaderBe)).toBe("image/tiff");
  });

  it("detects plain text", () => {
    const text = new TextEncoder().encode("The quick brown fox jumps over the lazy dog.\n");
    expect(detectMimeType(text)).toBe("text/plain");
  });

  it("returns unknown for buffers under 4 bytes", () => {
    expect(detectMimeType(new Uint8Array([0x25, 0x50, 0x44]))).toBe("unknown");
  });

  it("returns unknown for buffers with NUL bytes", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x00, 0x04, 0x05, 0x06, 0x07, 0x08]);
    expect(detectMimeType(bytes)).toBe("unknown");
  });
});
