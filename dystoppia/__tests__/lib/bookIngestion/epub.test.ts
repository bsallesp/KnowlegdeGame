/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { extractEpub } from "@/lib/bookIngestion/epub";
import { buildMinimalEpub } from "./epubFixture";

describe("extractEpub", () => {
  it("reads spine order and extracts chapter titles", async () => {
    const bytes = await buildMinimalEpub([
      { id: "c1", href: "c1.xhtml", title: "Chapter One", body: "<p>Opening paragraph.</p><p>Second paragraph.</p>" },
      { id: "c2", href: "c2.xhtml", title: "Chapter Two", body: "<p>Middle paragraph.</p>" },
      { id: "c3", href: "c3.xhtml", title: "Chapter Three", body: "<p>Closing paragraph.</p>" },
    ]);

    const result = await extractEpub(bytes);

    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].text).toContain("Opening paragraph");
    expect(result.pages[1].text).toContain("Middle paragraph");
    expect(result.pages[2].text).toContain("Closing paragraph");

    expect(result.chapters.map((c) => c.title)).toEqual(["Chapter One", "Chapter Two", "Chapter Three"]);
    expect(result.chapters[0].startPage).toBe(1);
    expect(result.chapters[2].startPage).toBe(3);
  });

  it("strips script and style content", async () => {
    const bytes = await buildMinimalEpub([
      {
        id: "c1",
        href: "c1.xhtml",
        title: "Chapter",
        body: "<script>alert('INJECTED')</script><style>.a{color:red}</style><p>visible text</p>",
      },
    ]);

    const { pages } = await extractEpub(bytes);
    expect(pages[0].text).toContain("visible text");
    expect(pages[0].text).not.toContain("INJECTED");
    expect(pages[0].text).not.toContain("color:red");
  });

  it("throws when container.xml is missing", async () => {
    const bogus = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    await expect(extractEpub(bogus)).rejects.toThrow();
  });
});
