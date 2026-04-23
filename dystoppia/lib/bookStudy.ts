import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

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
    id?: string;
    parentId?: string | null;
    title: string;
    order: number;
    startPage: number;
    endPage: number | null;
  }>;
};

type ChapterNode = {
  id: string;
  title: string;
  order: number;
  startPage: number;
  endPage: number | null;
  children: ChapterNode[];
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
    items: buildItemsFromTree(book),
  };
}

export async function createStudyTopicFromBook(userId: string, bookId: string): Promise<StudyTopicResult | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  if (!book) return null;
  if (book.status !== "ready" || book.pageCount < 1) throw new BookNotReadyError();

  const bookForPlan: SourceBook = {
    id: book.id,
    title: book.title,
    pageCount: book.pageCount,
    chapters: book.chapters.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      title: c.title,
      order: c.order,
      startPage: c.startPage,
      endPage: c.endPage,
    })),
  };

  const existing = await prisma.topic.findFirst({
    where: { sourceBookId: book.id, userId },
    include: topicInclude,
  });
  if (existing) return { created: false, topic: serializeTopic(existing) };

  const plan = planBookTopic(bookForPlan);
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

// Turn the flat chapter list (with optional parentId) into a tree, then produce one
// Item per root chapter and one SubItem per child chapter using the real chapter
// titles. When a root chapter has no children, it becomes a single SubItem carrying
// the same title (covering the whole chapter range). When the book has no chapters
// at all, we fall back to synthetic "Section N" buckets.
function buildItemsFromTree(book: SourceBook): BookTopicPlanChapter[] {
  const tree = buildChapterTree(book);

  if (tree.length === 0) {
    return splitRange(1, book.pageCount, FALLBACK_ITEM_PAGE_SIZE).map((range, index) => ({
      title: `Section ${index + 1}`,
      order: index,
      startPage: range.startPage,
      endPage: range.endPage,
      subItems: [
        {
          name: `Section ${index + 1}`,
          order: 0,
          sourceStartPage: range.startPage,
          sourceEndPage: range.endPage,
        },
      ],
    }));
  }

  return tree.map((root, rootIndex) => {
    const nextRootStart = tree[rootIndex + 1]?.startPage;
    const rootEnd = resolveEndPage(root, nextRootStart, book.pageCount);
    return {
      title: root.title,
      order: rootIndex,
      startPage: root.startPage,
      endPage: rootEnd,
      subItems: buildSubItems(root, rootEnd, book.pageCount),
    };
  });
}

function buildSubItems(
  parent: ChapterNode,
  parentEnd: number,
  pageCount: number,
): BookTopicPlanChapter["subItems"] {
  if (parent.children.length === 0) {
    return [
      {
        name: parent.title,
        order: 0,
        sourceStartPage: parent.startPage,
        sourceEndPage: parentEnd,
      },
    ];
  }

  return parent.children
    .map((child, index, all) => {
      const nextSiblingStart = all[index + 1]?.startPage;
      const fallback = nextSiblingStart ? nextSiblingStart - 1 : parentEnd;
      const childEnd = resolveEndPage(child, nextSiblingStart, pageCount, fallback);
      return {
        name: child.title,
        order: index,
        sourceStartPage: child.startPage,
        sourceEndPage: childEnd,
      };
    })
    .filter((sub) => sub.sourceEndPage >= sub.sourceStartPage);
}

function resolveEndPage(
  node: ChapterNode,
  nextSiblingStart: number | undefined,
  pageCount: number,
  fallback?: number,
): number {
  const inferred = nextSiblingStart
    ? nextSiblingStart - 1
    : fallback ?? pageCount;
  const declared = node.endPage ?? inferred;
  return Math.max(node.startPage, Math.min(declared, inferred, pageCount));
}

function buildChapterTree(book: SourceBook): ChapterNode[] {
  const sanitized = book.chapters
    .map((chapter) => {
      const startPage = clampPage(chapter.startPage, book.pageCount);
      if (startPage < 1) return null;
      return {
        id: chapter.id ?? `__c${chapter.order}__${startPage}`,
        parentId: chapter.parentId ?? null,
        title: cleanTitle(chapter.title) || "Untitled",
        order: chapter.order,
        startPage,
        endPage: chapter.endPage ? clampPage(chapter.endPage, book.pageCount) : null,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const ids = new Set(sanitized.map((c) => c.id));
  const byParent = new Map<string | null, typeof sanitized>();
  for (const c of sanitized) {
    // Treat parentId pointing at a chapter we don't have as "orphan root"; keeps
    // us resilient to stale/corrupted data instead of silently dropping nodes.
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(c);
    else byParent.set(key, [c]);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.startPage - b.startPage || a.order - b.order);
  }

  const build = (parentId: string | null): ChapterNode[] =>
    (byParent.get(parentId) ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      startPage: c.startPage,
      endPage: c.endPage,
      children: build(c.id),
    }));

  return build(null);
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

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 120);
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(pageCount, 1));
}
