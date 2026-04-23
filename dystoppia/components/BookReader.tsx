"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";
import type { Topic } from "@/types";
import {
  formatBookPageText,
  formatDisplayTitle,
  formatExtractionModeLabel,
  formatPageSourceLabel,
  type ReaderBlock,
} from "@/lib/bookReaderFormat";

interface Chapter {
  id: string;
  parentId: string | null;
  title: string;
  order: number;
  startPage: number;
  endPage: number | null;
}

interface BookDetail {
  id: string;
  title: string;
  author: string | null;
  mimeType: string;
  pageCount: number;
  status: string;
  extractionMode: string | null;
  createdAt: string;
  chapters: Chapter[];
}

interface PageData {
  pageNumber: number;
  text: string;
  source: string;
  confidence: number | null;
  charCount: number;
}

type ViewMode = "clean" | "raw";

export default function BookReader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { resetSession, setCurrentTopic } = useAppStore();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [viewMode, setViewMode] = useState<ViewMode>("clean");
  const [error, setError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    (async () => {
      const res = await fetch(`/api/books/${bookId}`);
      if (!res.ok) {
        if (!cancelled) setError(`book_load_failed:${res.status}`);
        return;
      }

      const data = (await res.json()) as { book: BookDetail };
      if (!cancelled) {
        setBook(data.book);
        setCurrentPage(1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    setLoadingPage(true);
    setError(null);

    (async () => {
      const res = await fetch(`/api/books/${bookId}/pages/${currentPage}`);
      if (!res.ok) {
        if (!cancelled) {
          setError(`page_load_failed:${res.status}`);
          setLoadingPage(false);
        }
        return;
      }

      const data = (await res.json()) as { page: PageData };
      if (!cancelled) {
        setPage(data.page);
        setLoadingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, book, currentPage]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const chapterEntries = useMemo(() => buildChapterEntries(book?.chapters ?? []), [book]);
  const activeChapter = useMemo(
    () => findActiveChapter(chapterEntries, currentPage),
    [chapterEntries, currentPage],
  );
  const formattedBlocks = useMemo(
    () => (page && viewMode === "clean" ? formatBookPageText(page.text) : []),
    [page, viewMode],
  );

  const gotoChapter = useCallback((startPage: number) => {
    setCurrentPage(startPage);
  }, []);

  const startStudy = useCallback(async () => {
    if (creatingTopic) return;
    setCreatingTopic(true);
    setError(null);

    try {
      const res = await fetch(`/api/books/${bookId}/to-topic`, { method: "POST" });
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body?.error ? String(body.error) : `to_topic_failed:${res.status}`);
      }

      const data = (await res.json()) as { topic: Topic };
      resetSession();
      setCurrentTopic(data.topic);
      router.push("/game");
    } catch (err) {
      setError(err instanceof Error ? err.message : "to_topic_failed");
    } finally {
      setCreatingTopic(false);
    }
  }, [bookId, creatingTopic, resetSession, router, setCurrentTopic]);

  const submitJump = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!book) return;

      const parsed = Number.parseInt(pageInput, 10);
      if (!Number.isInteger(parsed)) {
        setPageInput(String(currentPage));
        return;
      }

      setCurrentPage(clampPage(parsed, book.pageCount));
    },
    [book, currentPage, pageInput],
  );

  const canPrev = currentPage > 1;
  const canNext = useMemo(() => (book ? currentPage < book.pageCount : false), [book, currentPage]);
  const displayTitle = book ? formatDisplayTitle(book.title) : "";
  const createdAt = book ? new Date(book.createdAt).toLocaleDateString() : "";

  if (error) {
    return (
      <main className="min-h-screen bg-[#09090E]">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <Link href="/books" className="text-sm text-cyan-300">
            &larr; Back to library
          </Link>
          <div className="mt-8 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6">
            <p className="text-sm font-medium text-rose-100">Reader error</p>
            <p className="mt-2 text-sm text-rose-100/80">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="min-h-screen bg-[#09090E]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <ReaderSkeleton />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#09090E]">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 45% at 20% -10%, rgba(56,189,248,0.12) 0%, transparent 60%), radial-gradient(ellipse 65% 40% at 85% 10%, rgba(129,140,248,0.12) 0%, transparent 60%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside
            data-testid="reader-sidebar"
            className="space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-2"
          >
            <div className="rounded-[28px] border border-white/10 bg-[#12121A]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur sm:p-6 xl:shrink-0">
              <Link href="/books" className="text-sm text-cyan-300 transition-opacity hover:opacity-85">
                &larr; Back to library
              </Link>

              <div className="mt-5 flex flex-wrap gap-2">
                <MetadataPill tone="accent">{formatExtractionModeLabel(book.extractionMode)}</MetadataPill>
                <MetadataPill>{book.pageCount.toLocaleString()} pages</MetadataPill>
                <MetadataPill>{book.chapters.length.toLocaleString()} chapters</MetadataPill>
              </div>

              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
                {displayTitle}
              </h1>
              {book.author ? <p className="mt-2 text-sm text-white/70">{book.author}</p> : null}
              <p className="mt-3 text-sm leading-6 text-white/62">
                Read the processed source in a cleaner layout, then branch into study mode when the material is ready
                to turn into questions.
              </p>

              <button
                type="button"
                onClick={startStudy}
                disabled={creatingTopic || book.status !== "ready"}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/12 px-4 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                {creatingTopic ? "Preparing study topic..." : "Study this book"}
              </button>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <StatTile label="Current page" value={`${currentPage}/${book.pageCount}`} />
                <StatTile label="Imported" value={createdAt} />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Now reading</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {activeChapter ? formatDisplayTitle(activeChapter.title) : "Opening pages"}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  {activeChapter ? chapterRangeLabel(activeChapter, book.pageCount) : "No chapter marker for this page."}
                </p>
              </div>
            </div>

            <div
              data-testid="chapters-panel"
              className="rounded-[28px] border border-white/10 bg-[#12121A]/85 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Chapters</p>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/55">
                  {book.chapters.length}
                </span>
              </div>

              {chapterEntries.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-white/45">No chapter structure was detected for this upload.</p>
              ) : (
                <ul data-testid="chapters-list" className="mt-4 space-y-2">
                  {chapterEntries.map((chapter) => {
                    const isActive =
                      currentPage >= chapter.startPage &&
                      (chapter.endPage == null || currentPage <= chapter.endPage);

                    return (
                      <li key={chapter.id}>
                        <button
                          type="button"
                          onClick={() => gotoChapter(chapter.startPage)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            isActive
                              ? "border-cyan-300/35 bg-cyan-400/12 text-cyan-50 shadow-[0_12px_30px_rgba(6,182,212,0.12)]"
                              : "border-white/6 bg-white/[0.02] text-white/78 hover:border-white/14 hover:bg-white/[0.05]"
                          }`}
                          style={{ paddingLeft: `${0.85 + chapter.depth * 0.9}rem` }}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
                            p.{chapter.startPage}
                          </p>
                          <p className="mt-1 text-sm leading-5">{formatDisplayTitle(chapter.title)}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="sticky top-4 z-10 rounded-[28px] border border-white/10 bg-[#12121A]/88 px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:px-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/65">Reader</p>
                  <h2 className="mt-2 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {activeChapter ? formatDisplayTitle(activeChapter.title) : displayTitle}
                  </h2>
                  <p className="mt-1 text-sm text-white/58">
                    Page {currentPage} of {book.pageCount}
                    {activeChapter ? ` - ${chapterRangeLabel(activeChapter, book.pageCount)}` : ""}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <div
                    className="inline-flex rounded-2xl border border-white/10 bg-black/20 p-1"
                    role="group"
                    aria-label="Reader view mode"
                  >
                    <ToggleButton
                      active={viewMode === "clean"}
                      onClick={() => setViewMode("clean")}
                      label="Clean view"
                    />
                    <ToggleButton active={viewMode === "raw"} onClick={() => setViewMode("raw")} label="Raw text" />
                  </div>

                  <form onSubmit={submitJump} className="flex items-center gap-2">
                    <label htmlFor="page-jump" className="sr-only">
                      Jump to page
                    </label>
                    <input
                      id="page-jump"
                      type="number"
                      min={1}
                      max={book.pageCount}
                      inputMode="numeric"
                      value={pageInput}
                      onChange={(event) => setPageInput(event.target.value)}
                      className="w-24 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/35"
                      placeholder="Page"
                    />
                    <button
                      type="submit"
                      className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/82 transition hover:bg-white/[0.08]"
                    >
                      Go
                    </button>
                  </form>

                  <div className="flex items-center gap-2">
                    <NavButton
                      disabled={!canPrev}
                      onClick={() => setCurrentPage((pageNumber) => Math.max(1, pageNumber - 1))}
                      label="Prev"
                    />
                    <NavButton
                      disabled={!canNext}
                      onClick={() => setCurrentPage((pageNumber) => pageNumber + 1)}
                      label="Next"
                    />
                  </div>
                </div>
              </div>
            </div>

            <article className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] px-5 py-6 shadow-[0_28px_100px_rgba(0,0,0,0.34)] sm:px-8 sm:py-10 lg:px-12">
              <div className="mx-auto max-w-3xl">
                <div className="flex flex-wrap gap-2 border-b border-white/10 pb-5">
                  <MetadataPill tone="neutral">{page ? formatPageSourceLabel(page.source) : "Loading page"}</MetadataPill>
                  {page?.confidence != null ? (
                    <MetadataPill tone="warning">{Math.round(page.confidence * 100)}% OCR confidence</MetadataPill>
                  ) : null}
                  {page ? <MetadataPill>{page.charCount.toLocaleString()} chars</MetadataPill> : null}
                  <MetadataPill>{book.mimeType}</MetadataPill>
                </div>

                {page && page.source !== "native" ? (
                  <div className="mt-5 rounded-2xl border border-amber-300/18 bg-amber-300/8 p-4 text-sm leading-6 text-amber-50/85">
                    This page came from OCR. Clean view smooths the layout for reading, while Raw text helps when you
                    need to inspect the extraction literally.
                  </div>
                ) : null}

                <div className="mt-8 space-y-5" data-testid="reader-content">
                  {loadingPage ? (
                    <ReaderContentSkeleton />
                  ) : page && page.text.length > 0 ? (
                    viewMode === "raw" ? (
                      <pre
                        data-testid="raw-reader"
                        className="overflow-x-auto whitespace-pre-wrap rounded-3xl border border-white/8 bg-black/25 p-5 font-sans text-[15px] leading-7 text-white/88"
                      >
                        {page.text}
                      </pre>
                    ) : (
                      renderBlocks(formattedBlocks)
                    )
                  ) : (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-6 text-white/58">
                      This page has no extracted text yet. It is likely a scanned or image-heavy page that still needs
                      OCR support.
                    </div>
                  )}
                </div>
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}

function renderBlocks(blocks: ReaderBlock[]) {
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      return (
        <h3 key={`heading-${index}`} className="text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
          {block.text}
        </h3>
      );
    }

    if (block.type === "lead") {
      return (
        <div key={`lead-${index}`} className="space-y-1">
          {block.lines.map((line, lineIndex) => (
            <p key={`lead-line-${lineIndex}`} className="text-lg font-medium leading-8 text-cyan-50/90 sm:text-xl">
              {line}
            </p>
          ))}
        </div>
      );
    }

    if (block.type === "list") {
      return (
        <ul key={`list-${index}`} className="space-y-3 pl-6 text-[17px] leading-8 text-white/88">
          {block.items.map((item, itemIndex) => (
            <li key={`list-item-${itemIndex}`} className="marker:text-cyan-300">
              {item}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={`paragraph-${index}`} className="text-[17px] leading-8 text-white/88 sm:text-[18px]">
        {block.text}
      </p>
    );
  });
}

function buildChapterEntries(chapters: Chapter[]): Array<Chapter & { depth: number }> {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));

  return chapters.map((chapter) => {
    let depth = 0;
    let parentId = chapter.parentId;
    const visited = new Set<string>([chapter.id]);

    while (parentId) {
      if (visited.has(parentId)) break;
      visited.add(parentId);

      const parent = byId.get(parentId);
      if (!parent) break;

      depth += 1;
      parentId = parent.parentId;
    }

    return { ...chapter, depth };
  });
}

function findActiveChapter(
  chapters: Array<Chapter & { depth: number }>,
  currentPage: number,
): (Chapter & { depth: number }) | null {
  let match: (Chapter & { depth: number }) | null = null;

  for (const chapter of chapters) {
    if (currentPage < chapter.startPage) continue;
    if (chapter.endPage != null && currentPage > chapter.endPage) continue;
    match = chapter;
  }

  return match;
}

function chapterRangeLabel(chapter: Chapter, pageCount: number): string {
  if (chapter.endPage && chapter.endPage >= chapter.startPage) {
    return `Pages ${chapter.startPage}-${chapter.endPage}`;
  }

  if (chapter.startPage < pageCount) {
    return `Starts at page ${chapter.startPage}`;
  }

  return `Page ${chapter.startPage}`;
}

function clampPage(page: number, pageCount: number): number {
  return Math.max(1, Math.min(page, pageCount));
}

function ToggleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-2xl px-3 py-2 text-sm font-medium transition ${
        active ? "bg-cyan-400/18 text-cyan-50" : "text-white/58 hover:text-white/82"
      }`}
    >
      {label}
    </button>
  );
}

function NavButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/84 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {label}
    </button>
  );
}

function MetadataPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-cyan-300/18 bg-cyan-400/10 text-cyan-50/90"
      : tone === "warning"
        ? "border-amber-300/18 bg-amber-300/10 text-amber-50/88"
        : "border-white/10 bg-white/[0.04] text-white/64";

  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}>{children}</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="h-72 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
        <div className="h-96 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.03]" />
      </div>
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-[28px] border border-white/10 bg-white/[0.04]" />
        <div className="h-[65vh] animate-pulse rounded-[32px] border border-white/10 bg-white/[0.03]" />
      </div>
    </div>
  );
}

function ReaderContentSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-white/[0.06]" />
      <div className="h-6 w-1/3 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="space-y-3">
        <div className="h-4 animate-pulse rounded-full bg-white/[0.05]" />
        <div className="h-4 animate-pulse rounded-full bg-white/[0.05]" />
        <div className="h-4 w-[92%] animate-pulse rounded-full bg-white/[0.05]" />
        <div className="h-4 w-[95%] animate-pulse rounded-full bg-white/[0.05]" />
        <div className="h-4 w-[78%] animate-pulse rounded-full bg-white/[0.05]" />
      </div>
    </div>
  );
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
