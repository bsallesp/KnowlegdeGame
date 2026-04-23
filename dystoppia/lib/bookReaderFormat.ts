export type ReaderBlock =
  | {
      type: "heading";
      text: string;
    }
  | {
      type: "lead";
      lines: string[];
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      items: string[];
    };

const LIST_MARKER_RE = /^(?:[-*•]|\d+[\.\)])\s+(.+)$/;
const SECTION_WORD_RE =
  /(?:^|\b)(chapter|section|appendix|part|unit|module|lesson|preface|introduction|conclusion|prologue|epilogue)\b/i;

export function formatBookPageText(text: string): ReaderBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(normalizeLine);
  const blocks: ReaderBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let leadLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const joined = joinParagraphLines(paragraphLines);
    if (joined) blocks.push({ type: "paragraph", text: joined });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  const flushLead = () => {
    if (leadLines.length === 0) return;
    blocks.push({ type: "lead", lines: leadLines });
    leadLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      flushLead();
      flushParagraph();
      flushList();
      continue;
    }

    const listItem = parseListItem(line);
    if (listItem) {
      flushLead();
      flushParagraph();
      listItems.push(listItem);
      continue;
    }
    flushList();

    if (looksLikeHeading(line)) {
      flushLead();
      flushParagraph();
      blocks.push({ type: "heading", text: normalizeHeading(line) });
      continue;
    }

    if (leadLines.length > 0) {
      if (looksLikeLeadContinuation(line) && leadLines.length < 3) {
        leadLines.push(line);
        continue;
      }
      flushLead();
    }

    const previousBlock = blocks[blocks.length - 1];
    if (
      paragraphLines.length === 0 &&
      listItems.length === 0 &&
      leadLines.length === 0 &&
      looksLikeLeadStart(line) &&
      (blocks.length === 0 || previousBlock?.type === "heading")
    ) {
      leadLines.push(line);
      continue;
    }

    paragraphLines.push(line);
  }

  flushLead();
  flushParagraph();
  flushList();

  if (blocks.length > 0) return blocks;

  const fallback = normalizeInlineWhitespace(text);
  return fallback ? [{ type: "paragraph", text: fallback }] : [];
}

export function formatDisplayTitle(title: string): string {
  return title
    .replace(/\.(pdf|epub|txt)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatExtractionModeLabel(mode: string | null): string {
  if (mode === "native") return "Native text";
  if (mode === "mixed") return "Mixed extraction";
  if (mode === "ocr") return "OCR only";
  return "Unknown extraction";
}

export function formatPageSourceLabel(source: string): string {
  if (source === "native") return "Native text";
  if (source === "ocr") return "OCR text";
  return source;
}

function parseListItem(line: string): string | null {
  const match = line.match(LIST_MARKER_RE);
  return match ? match[1].trim() : null;
}

function normalizeLine(line: string): string {
  return collapseSpacedCapsWords(line)
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function collapseSpacedCapsWords(value: string): string {
  return value.replace(/\b(?:[A-Z]\s+){2,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ""));
}

function looksLikeHeading(line: string): boolean {
  if (line.length < 4 || line.length > 110 || LIST_MARKER_RE.test(line)) return false;
  if (/[.!?]$/.test(line)) return false;

  const words = line.split(/\s+/);
  const alpha = line.replace(/[^A-Za-z]/g, "");
  const uppercase = alpha.replace(/[^A-Z]/g, "").length;
  const upperRatio = alpha.length === 0 ? 0 : uppercase / alpha.length;

  return (
    SECTION_WORD_RE.test(line) ||
    (line.includes("|") && words.length <= 12) ||
    (words.length <= 10 && alpha.length >= 5 && upperRatio >= 0.72) ||
    /^(\d+(?:\.\d+){0,2}\s+)?[A-Z][\w'/:-]*(?:\s+[A-Z][\w'/:-]*){1,8}$/.test(line)
  );
}

function looksLikeLeadStart(line: string): boolean {
  if (looksLikeHeading(line) || LIST_MARKER_RE.test(line)) return false;
  if (line.length > 52 || /[.!?;:-]$/.test(line)) return false;
  return /^[A-Z0-9]/.test(line) && line.split(/\s+/).length <= 8;
}

function looksLikeLeadContinuation(line: string): boolean {
  if (looksLikeHeading(line) || LIST_MARKER_RE.test(line)) return false;
  if (line.length > 52 || /[.!?;:-]$/.test(line)) return false;
  return line.split(/\s+/).length <= 8;
}

function normalizeHeading(line: string): string {
  return line
    .replace(/\b(CHAPTER|SECTION|PART|APPENDIX)(\d+)/g, "$1 $2")
    .replace(/\s*\|\s*/g, " | ")
    .trim();
}

function joinParagraphLines(lines: string[]): string {
  let out = "";

  for (const line of lines) {
    if (!out) {
      out = line;
      continue;
    }

    if (out.endsWith("-") && /^[a-z]/.test(line)) {
      out = `${out.slice(0, -1)}${line}`;
      continue;
    }

    if (/[(/"']$/.test(out)) {
      out += line;
      continue;
    }

    out += ` ${line}`;
  }

  return normalizeInlineWhitespace(out);
}

function normalizeInlineWhitespace(value: string): string {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}
