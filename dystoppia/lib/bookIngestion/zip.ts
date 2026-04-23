import yauzl from "yauzl";

// Unzip an in-memory ZIP into a { path -> bytes } map. Used by the EPUB extractor.
export function unzipToMap(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip_open_failed"));
      const files = new Map<string, Uint8Array>();

      zip.on("error", reject);
      zip.on("end", () => resolve(files));

      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error("zip_read_failed"));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            files.set(entry.fileName, new Uint8Array(Buffer.concat(chunks)));
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });

      zip.readEntry();
    });
  });
}
