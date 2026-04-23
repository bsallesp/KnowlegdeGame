import { describe, expect, test } from "vitest";
import { formatBookPageText, formatDisplayTitle } from "@/lib/bookReaderFormat";

describe("bookReaderFormat", () => {
  test("cleans uploaded filenames into readable display titles", () => {
    expect(formatDisplayTitle("Microsoft_Press_ebook_Introducing_Power_BI_PDF_mobile.pdf")).toBe(
      "Microsoft Press ebook Introducing Power BI PDF mobile",
    );
  });

  test("turns extracted page text into structured reader blocks", () => {
    const blocks = formatBookPageText(`
C H A P T E R 2 | Sharing the dashboard
Creating a group
workspace in Power BI

Let's return to David and Wendy.
After David invited Wendy, he realizes that he will need to repeat the same share operation.

- Share dashboards with the group
- Keep editing rights scoped
    `);

    expect(blocks).toEqual([
      { type: "heading", text: "CHAPTER 2 | Sharing the dashboard" },
      { type: "lead", lines: ["Creating a group", "workspace in Power BI"] },
      {
        type: "paragraph",
        text: "Let's return to David and Wendy. After David invited Wendy, he realizes that he will need to repeat the same share operation.",
      },
      {
        type: "list",
        items: ["Share dashboards with the group", "Keep editing rights scoped"],
      },
    ]);
  });

  test("joins wrapped lines and repairs simple hyphenation", () => {
    const blocks = formatBookPageText(`
Teams can auto-
matically collaborate
without losing context.
    `);

    expect(blocks).toEqual([
      {
        type: "paragraph",
        text: "Teams can automatically collaborate without losing context.",
      },
    ]);
  });
});
