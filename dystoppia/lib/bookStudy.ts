import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

const DEFAULT_SUBITEM_PAGE_SIZE = 8;
const FALLBACK_ITEM_PAGE_SIZE = 32;

export interface BookTopicPlanChapter {
  title: string;
  order: number;
  startPage: number;
  endPage: number;
  subItems: Array<{
    name: string;
    order: number;
    sourceStartPage: number;
    sourceEndPage: number;
  }>;
}

export interface BookTopicPlan {
  name: string;
  slug: string;
  teachingProfile: {
    style: string;
    register: string;
    questionPatterns: string[];
    contextHint: string;
    exampleDomain: string;
    assessmentFocus: string;
  };
  items: BookTopicPlanChapter[];
}

export class BookNotReadyError extends Error {
  constructor() {
    super("book_not_ready");
    this.name = "BookNotReadyError";
  }
}

export type StudyTopicResult = {
  created: boolean;
  topic: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    teachingProfile: BookTopicPlan["teachingProfile"];
    items: Array<{
      id: string;
      topicId: string;
      name: string;
      order: number;
      muted: boolean;
      subItems: Array<{
        id: string;
        itemId: string;
        name: string;
        order: number;
        muted: boolean;
        difficulty: number;
      }>;
    }>;
  };
};

type SourceBook = {
  id: string;
  title: string;
  pageCount: number;
  chapters: Array<{
    title: string;
    order: number;
    startPage: number;
    endPage: number | null;
  }>;
};

type TopicRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  teachingProfile: string | null;
  items: Array<{
    id: string;
    topicId: string;
    name: string;
    order: number;
    muted: boolean;
    subItems: Array<{
      id: string;
      itemId: string;
      name: string;
      order: number;
      muted: boolean;
      difficulty: number;
    }>;
  }>;
};

export function planBookTopic(book: SourceBook): BookTopicPlan {
  const ranges = buildChapterRanges(book);
  return {
    name: book.title,
    slug: bookStudySlug(book.title, book.id),
    teachingProfile: {
      style: "source_grounded",
      register: "instructional_practical",
      questionPatterns: [
        "According to the uploaded source, what does...",
        "Which statement best reflects the source section about...",
        "In this page range, why is...",
      ],
      contextHint: "Use the uploaded source as the authority. Ask about facts, distinctions, and practical implications that are explicitly present in the selected pages.",
      exampleDomain: book.title,
      assessmentFocus: "comprehension",
    },
    items: ranges.map((range, index) => ({
      title: range.title,
      order: index,
      startPage: range.startPage,
      endPage: range.endPage,
      subItems: splitRange(range.startPage, range.endPage, DEFAULT_SUBITEM_PAGE_SIZE).map((subRange, subIndex) => ({
        name: pageRangeLabel(subRange.startPage, subRange.endPage),
        order: subIndex,
        sourceStartPage: subRange.startPage,
        sourceEndPage: subRange.endPage,
      })),
    })),
  };
}

export async function createStudyTopicFromBook(userId: string, bookId: string): Promise<StudyTopicResult | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  if (!book) return null;
  if (book.status !== "ready" || book.pageCount < 1) throw new BookNotReadyError();

  const existing = await prisma.topic.findFirst({
    where: { sourceBookId: book.id, userId },
    include: topicInclude,
  });
  if (existing) return { created: false, topic: serializeTopic(existing) };

  const plan = planBookTopic(book);
  const topic = await prisma.topic.create({
    data: {
      name: plan.name,
      slug: plan.slug,
      userId,
      sourceBookId: book.id,
      teachingProfile: JSON.stringify(plan.teachingProfile),
      items: {
        create: plan.items.map((item) => ({
          name: item.title,
          order: item.order,
          sourceStartPage: item.startPage,
          sourceEndPage: item.endPage,
          subItems: {
            create: item.subItems.map((sub) => ({
              name: sub.name,
              order: sub.order,
              difficulty: 1,
              sourceStartPage: sub.sourceStartPage,
              sourceEndPage: sub.sourceEndPage,
            })),
          },
        })),
      },
    },
    include: topicInclude,
  });

  return { created: true, topic: serializeTopic(topic) };
}

const topicInclude = {
  items: {
    orderBy: { order: "asc" as const },
    include: {
      subItems: { orderBy: { order: "asc" as const } },
    },
  },
};

function serializeTopic(topic: TopicRecord): StudyTopicResult["topic"] {
  return {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    createdAt: topic.createdAt.toISOString(),
    teachingProfile: topic.teachingProfile ? JSON.parse(topic.teachingProfile) : null,
    items: topic.items.map((item) => ({
      id: item.id,
      topicId: item.topicId,
      name: item.name,
      order: item.order,
      muted: item.muted,
      subItems: item.subItems.map((sub) => ({
        id: sub.id,
        itemId: sub.itemId,
        name: sub.name,
        order: sub.order,
        muted: sub.muted,
        difficulty: sub.difficulty,
      })),
    })),
  };
}

function buildChapterRanges(book: SourceBook): Array<{ title: string; startPage: number; endPage: number }> {
  const sorted = book.chapters
    .map((chapter) => ({
      title: cleanTitle(chapter.title),
      startPage: clampPage(chapter.startPage, book.pageCount),
      endPage: chapter.endPage ? clampPage(chapter.endPage, book.pageCount) : null,
    }))
    .filter((chapter) => chapter.startPage >= 1)
    .sort((a, b) => a.startPage - b.startPage);

  if (sorted.length === 0) {
    return splitRange(1, book.pageCount, FALLBACK_ITEM_PAGE_SIZE).map((range, index) => ({
      title: `Section ${index + 1}`,
      startPage: range.startPage,
      endPage: range.endPage,
    }));
  }

  return sorted
    .map((chapter, index) => {
      const nextStart = sorted[index + 1]?.startPage;
      const inferredEnd = nextStart ? nextStart - 1 : book.pageCount;
      const endPage = Math.max(chapter.startPage, Math.min(chapter.endPage ?? inferredEnd, inferredEnd, book.pageCount));
      return { title: chapter.title || `Section ${index + 1}`, startPage: chapter.startPage, endPage };
    })
    .filter((range) => range.endPage >= range.startPage);
}

function splitRange(startPage: number, endPage: number, size: number): Array<{ startPage: number; endPage: number }> {
  const ranges: Array<{ startPage: number; endPage: number }> = [];
  for (let start = startPage; start <= endPage; start += size) {
    ranges.push({ startPage: start, endPage: Math.min(endPage, start + size - 1) });
  }
  return ranges;
}

function bookStudySlug(title: string, bookId: string): string {
  const base = slugify(title) || "uploaded-book";
  return `${base}-${bookId.slice(-8).toLowerCase()}`;
}

function pageRangeLabel(startPage: number, endPage: number): string {
  return startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}-${endPage}`;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 120);
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
}
