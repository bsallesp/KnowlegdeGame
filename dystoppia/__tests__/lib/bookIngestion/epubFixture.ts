import yazl from "yazl";

export interface FixtureChapter {
  id: string;
  href: string;
  title: string;
  body: string;
}

// Build a minimal valid EPUB buffer in memory for tests. Covers:
//   META-INF/container.xml -> OEBPS/content.opf
//   OEBPS/content.opf (manifest + spine)
//   OEBPS/<href> for each chapter as XHTML
export function buildMinimalEpub(chapters: FixtureChapter[]): Promise<Uint8Array> {
  const zip = new yazl.ZipFile();

  const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const manifestItems = chapters
    .map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spineItems = chapters.map((c) => `<itemref idref="${c.id}"/>`).join("\n    ");

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">test-book</dc:identifier>
    <dc:title>Test Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;

  zip.addBuffer(Buffer.from(container, "utf8"), "META-INF/container.xml");
  zip.addBuffer(Buffer.from(opf, "utf8"), "OEBPS/content.opf");

  for (const c of chapters) {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c.title}</title></head>
<body><h1>${c.title}</h1>${c.body}</body></html>`;
    zip.addBuffer(Buffer.from(xhtml, "utf8"), `OEBPS/${c.href}`);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (c: Buffer) => chunks.push(c));
    zip.outputStream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    zip.outputStream.on("error", reject);
    zip.end();
  });
}
