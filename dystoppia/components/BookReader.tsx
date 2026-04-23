"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";
import type { Topic } from "@/types";

interface Chapter {
  id: string;
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

export default function BookReader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const { resetSession, setCurrentTopic } = useAppStore();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);

  useEffect(() => {
    let cancelled = false;
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
    (async () => {
      const res = await fetch(`/api/books/${bookId}/pages/${currentPage}`);
      if (!res.ok) {
        if (!cancelled) setError(`page_load_failed:${res.status}`);
        setLoadingPage(false);
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
      router.push("/session");
    } catch (err) {
      setError(err instanceof Error ? err.message : "to_topic_failed");
    } finally {
      setCreatingTopic(false);
    }
  }, [bookId, creatingTopic, resetSession, router, setCurrentTopic]);

  const canPrev = currentPage > 1;
  const canNext = useMemo(() => (book ? currentPage < book.pageCount : false), [book, currentPage]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/books" className="text-sm text-cyan-300">&larr; Back to library</Link>
        <p className="mt-8 text-rose-300">Error: {error}</p>
      </main>
    );
  }
  if (!book) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-white/60 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-12 gap-6">
      <aside className="col-span-12 md:col-span-4 lg:col-span-3 border-r border-white/10 pr-4">
        <Link href="/books" className="text-sm text-cyan-300">&larr; Back to library</Link>
        <h1 className="mt-4 text-lg font-semibold">{book.title}</h1>
        <p className="mt-1 text-xs text-white/50">
          {book.pageCount} pages · {book.extractionMode ?? "unknown"}
        </p>

        <button
          type="button"
          onClick={startStudy}
          disabled={creatingTopic || book.status !== "ready"}
          className="mt-4 w-full rounded border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          {creatingTopic ? "Preparing..." : "Study this book"}
        </button>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Chapters</p>
          {book.chapters.length === 0 ? (
            <p className="text-xs text-white/40">No chapter structure detected.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {book.chapters.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => gotoChapter(c.startPage)}
                    className={`w-full text-left text-sm px-2 py-1 rounded hover:bg-white/10 ${
                      currentPage >= c.startPage && (c.endPage == null || currentPage <= c.endPage)
                        ? "bg-cyan-500/10 text-cyan-100"
                        : "text-white/80"
                    }`}
                  >
                    <span className="text-white/40 mr-2">p.{c.startPage}</span>
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="col-span-12 md:col-span-8 lg:col-span-9">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded border border-white/10 px-3 py-1 text-sm disabled:opacity-30 hover:bg-white/10"
            >
              &larr; Prev
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="rounded border border-white/10 px-3 py-1 text-sm disabled:opacity-30 hover:bg-white/10"
            >
              Next &rarr;
            </button>
          </div>
          <span className="text-sm text-white/50">
            Page {currentPage} of {book.pageCount}
          </span>
        </div>

        <article className="rounded-lg border border-white/10 bg-white/5 p-6 min-h-[60vh]">
          {loadingPage ? (
            <p className="text-sm text-white/50">Loading page…</p>
          ) : page && page.text.length > 0 ? (
            <pre className="whitespace-pre-wrap font-sans text-[15px] leading-7 text-white/90">
              {page.text}
            </pre>
          ) : (
            <p className="text-sm text-white/50">
              This page has no extracted text (likely a scanned/image page — needs OCR).
            </p>
          )}
        </article>
      </section>
    </main>
  );
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
