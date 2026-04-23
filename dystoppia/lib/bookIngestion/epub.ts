import type { ExtractedChapter, ExtractedPage } from "./types";
import { unzipToMap } from "./zip";

export interface EpubExtraction {
  pages: ExtractedPage[];
  chapters: ExtractedChapter[];
}

// EPUB structure:
//   META-INF/container.xml points to a .opf file.
//   The .opf has <manifest> (files) and <spine> (reading order of HTML files).
//   Each spine item becomes one "page" in our model.
export async function extractEpub(bytes: Uint8Array): Promise<EpubExtraction> {
  const files = await unzipToMap(bytes);

  const containerXml = readTextEntry(files, "META-INF/container.xml");
  if (!containerXml) throw new Error("epub_missing_container");

  const opfPath = extractOpfPath(containerXml);
  if (!opfPath) throw new Error("epub_opf_path_missing");

  const opfXml = readTextEntry(files, opfPath);
  if (!opfXml) throw new Error("epub_opf_missing");

  const opfDir = dirnameOf(opfPath);
  const { manifest, spineIds } = parseOpf(opfXml);

  const pages: ExtractedPage[] = [];
  const chapters: ExtractedChapter[] = [];
  let pageNumber = 1;

  for (const idref of spineIds) {
    const href = manifest.get(idref);
    if (!href) continue;
    const fullPath = joinPath(opfDir, href);
    const html = readTextEntry(files, fullPath);
    if (!html) continue;

    const title = extractFirstHeading(html) ?? href;
    const text = stripHtml(html);
    if (text.length === 0) continue;

    pages.push({ pageNumber, text, source: "native" });
    chapters.push({
      title,
      order: chapters.length,
      startPage: pageNumber,
      endPage: pageNumber,
    });
    pageNumber++;
  }

  return { pages, chapters };
}

function readTextEntry(files: Map<string, Uint8Array>, path: string): string | null {
  const bytes = files.get(path);
  if (!bytes) return null;
  return new TextDecoder("utf-8").decode(bytes);
}

function extractOpfPath(containerXml: string): string | null {
  const m = containerXml.match(/<rootfile[^>]*\sfull-path="([^"]+)"/i);
  return m ? m[1] : null;
}

interface ParsedOpf {
  manifest: Map<string, string>;
  spineIds: string[];
}

function parseOpf(opfXml: string): ParsedOpf {
  const manifest = new Map<string, string>();
  const itemRegex = /<item\b[^>]*\/>/gi;
  for (const match of opfXml.matchAll(itemRegex)) {
    const tag = match[0];
    const id = attr(tag, "id");
    const href = attr(tag, "href");
    const mediaType = attr(tag, "media-type") ?? "";
    if (id && href && /xhtml|html/.test(mediaType)) manifest.set(id, href);
  }

  const spineIds: string[] = [];
  const spineRegex = /<itemref\b[^>]*\/>/gi;
  for (const match of opfXml.matchAll(spineRegex)) {
    const id = attr(match[0], "idref");
    if (id) spineIds.push(id);
  }

  return { manifest, spineIds };
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstHeading(html: string): string | null {
  const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!m) return null;
  const text = stripHtml(m[1]);
  return text.length > 0 ? text : null;
}

function dirnameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.substring(0, i);
}

function joinPath(dir: string, rel: string): string {
  if (!dir) return rel;
  if (rel.startsWith("/")) return rel.slice(1);
  return `${dir}/${rel}`;
}
