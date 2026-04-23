export type BookMimeType =
  | "application/pdf"
  | "application/epub+zip"
  | "text/plain"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/tiff"
  | "unknown";

export type PageSource = "native" | "ocr" | "vision";
export type ExtractionMode = "native" | "ocr" | "vision" | "mixed";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  source: PageSource;
  confidence?: number;
}

export interface ExtractedChapter {
  title: string;
  order: number;
  startPage: number;
  endPage?: number;
  children?: ExtractedChapter[];
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  chapters: ExtractedChapter[];
  language?: string;
  needsOcrPages: number[];
  mode: ExtractionMode;
}

export interface OcrPageResult {
  text: string;
  confidence?: number;
}

export interface OcrAdapter {
  isConfigured(): boolean;
  extractPage(bytes: Uint8Array, mimeType: string): Promise<OcrPageResult>;
}
