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

  test("chapters without children become one subitem carrying the chapter title", () => {
    const plan = planBookTopic({
      id: "book_12345678",
      title: "Long Book",
      pageCount: 25,
      chapters: [{ title: "Big Chapter", order: 0, startPage: 1, endPage: 25 }],
    });

    expect(plan.items[0].subItems).toEqual([
      { name: "Big Chapter", order: 0, sourceStartPage: 1, sourceEndPage: 25 },
    ]);
  });

  test("child chapters become subitems with their real titles", () => {
    const plan = planBookTopic({
      id: "book_nested01",
      title: "Nested Book",
      pageCount: 100,
      chapters: [
        { id: "ch1", parentId: null, title: "Chapter 1: Foundations", order: 0, startPage: 1, endPage: null },
        { id: "ch1-1", parentId: "ch1", title: "1.1 History", order: 0, startPage: 1, endPage: null },
        { id: "ch1-2", parentId: "ch1", title: "1.2 Core Ideas", order: 1, startPage: 10, endPage: null },
        { id: "ch2", parentId: null, title: "Chapter 2: Practice", order: 1, startPage: 30, endPage: null },
        { id: "ch2-1", parentId: "ch2", title: "2.1 Setup", order: 0, startPage: 30, endPage: null },
        { id: "ch2-2", parentId: "ch2", title: "2.2 Workflow", order: 1, startPage: 60, endPage: null },
      ],
    });

    expect(plan.items.map((i) => i.title)).toEqual([
      "Chapter 1: Foundations",
      "Chapter 2: Practice",
    ]);
    expect(plan.items[0].subItems.map((s) => [s.name, s.sourceStartPage, s.sourceEndPage])).toEqual([
      ["1.1 History", 1, 9],
      ["1.2 Core Ideas", 10, 29],
    ]);
    expect(plan.items[1].subItems.map((s) => [s.name, s.sourceStartPage, s.sourceEndPage])).toEqual([
      ["2.1 Setup", 30, 59],
      ["2.2 Workflow", 60, 100],
    ]);
  });

  test("orphan child whose parentId points nowhere is treated as a root", () => {
    const plan = planBookTopic({
      id: "book_orphan01",
      title: "Orphan",
      pageCount: 20,
      chapters: [
        { id: "c1", parentId: null, title: "Kept", order: 0, startPage: 1, endPage: null },
        { id: "c2", parentId: "missing-parent", title: "Loose", order: 0, startPage: 10, endPage: null },
      ],
    });

    expect(plan.items.map((i) => i.title)).toEqual(["Kept", "Loose"]);
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
    for (const item of plan.items) {
      expect(item.subItems).toHaveLength(1);
      expect(item.subItems[0].name).toBe(item.title);
    }
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
