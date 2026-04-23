/**
 * @vitest-environment node
 */
import { describe, expect, test } from "vitest";
import { planBookTopic } from "@/lib/bookStudy";

describe("planBookTopic", () => {
  test("uses PDF chapter starts to infer page ranges", () => {
    const plan = planBookTopic({
      id: "book_abcdef12",
      title: "Introducing Power BI",
      pageCount: 40,
      chapters: [
        { title: "Front Cover", order: 0, startPage: 1, endPage: null },
        { title: "Chapter 1: Introducing Power BI", order: 1, startPage: 5, endPage: null },
        { title: "Chapter 2: Sharing Reports", order: 2, startPage: 21, endPage: null },
      ],
    });

    expect(plan.slug).toBe("introducing-power-bi-abcdef12");
    expect(plan.items.map((item) => [item.title, item.startPage, item.endPage])).toEqual([
      ["Front Cover", 1, 4],
      ["Chapter 1: Introducing Power BI", 5, 20],
      ["Chapter 2: Sharing Reports", 21, 40],
    ]);
  });

  test("splits large chapter ranges into page-bounded subitems", () => {
    const plan = planBookTopic({
      id: "book_12345678",
      title: "Long Book",
      pageCount: 25,
      chapters: [{ title: "Big Chapter", order: 0, startPage: 1, endPage: 25 }],
    });

    expect(plan.items[0].subItems.map((sub) => [sub.name, sub.sourceStartPage, sub.sourceEndPage])).toEqual([
      ["Pages 1-8", 1, 8],
      ["Pages 9-16", 9, 16],
      ["Pages 17-24", 17, 24],
      ["Page 25", 25, 25],
    ]);
  });

  test("falls back to synthetic sections when no chapter structure exists", () => {
    const plan = planBookTopic({
      id: "book_deadbeef",
      title: "Scanned Notes",
      pageCount: 70,
      chapters: [],
    });

    expect(plan.items.map((item) => [item.title, item.startPage, item.endPage])).toEqual([
      ["Section 1", 1, 32],
      ["Section 2", 33, 64],
      ["Section 3", 65, 70],
    ]);
  });

  test("normalizes noisy chapter titles", () => {
    const plan = planBookTopic({
      id: "book_feedface",
      title: "Whitespace",
      pageCount: 3,
      chapters: [{ title: "  Chapter\r\nOne   ", order: 0, startPage: 1, endPage: null }],
    });

    expect(plan.items[0].title).toBe("Chapter One");
  });
});
