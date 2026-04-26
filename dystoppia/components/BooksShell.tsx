"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { formatDisplayTitle, formatExtractionModeLabel } from "@/lib/bookReaderFormat";

interface BookSummary {
  id: string;
  title: string;
  mimeType: string;
  pageCount: number;
  status: string;
  extractionMode: string | null;
  createdAt: string;
}

export default function BooksShell() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/books");
    if (!res.ok) {
      setError(`list_failed:${res.status}`);
      setBooks([]);
      return;
    }

    const data = (await res.json()) as { books: BookSummary[] };
    setBooks(data.books);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUpload = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      const form = event.currentTarget;
      const data = new FormData(form);
      const file = data.get("file");
      if (!(file instanceof File) || file.size === 0) {
        setError("no_file");
        return;
      }

      setUploading(true);
      try {
        const res = await fetch("/api/books/upload", { method: "POST", body: data });
        if (!res.ok) {
          const body = await safeJson(res);
          setError(body?.error ? String(body.error) : `upload_failed:${res.status}`);
          return;
        }

        form.reset();
        await refresh();
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  // Função para apagar livro
  const onDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this book? This action cannot be undone.")) return;
      setError(null);
      try {
        const res = await fetch(`/api/books/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const body = await safeJson(res);
          setError(body?.error ? String(body.error) : `delete_failed:${res.status}`);
          return;
        }
        await refresh();
      } catch {
        setError("delete_failed");
      }
    },
    [refresh],
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Library</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Uploaded books</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
          Upload a source file, let Dystoppia process it, then open the reader to inspect the material before turning
          it into study content.
        </p>
      </div>

      <form
        onSubmit={onUpload}
        className="mb-8 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
      >
        <label className="text-sm font-medium text-white/76">Upload a book (PDF, EPUB, TXT, or image)</label>
        <input
          name="file"
          type="file"
          accept=".pdf,.epub,.txt,.png,.jpg,.jpeg,.webp,.tiff,application/pdf,application/epub+zip,text/plain,image/*"
          className="rounded-2xl border border-dashed border-white/14 bg-black/15 px-3 py-4 text-sm text-white/72"
          required
        />
        <input
          name="title"
          type="text"
          placeholder="Title (optional - uses filename otherwise)"
          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm"
          maxLength={300}
        />
        <button
          type="submit"
          disabled={uploading}
          className="self-start rounded-2xl border border-cyan-400/30 bg-cyan-500/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {uploading ? "Processing..." : "Upload and process"}
        </button>
        {error ? <p className="text-sm text-rose-300">Error: {error}</p> : null}
      </form>

      {books === null ? (
        <p className="text-sm text-white/50">Loading...</p>
      ) : books.length === 0 ? (
        <p className="text-sm text-white/50">No books uploaded yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-[28px] border border-white/10">
          {books.map((book) => (
            <li
              key={book.id}
              className="border-b border-white/10 bg-white/[0.04] px-4 py-4 transition last:border-b-0 hover:bg-white/[0.07] flex items-center justify-between gap-4"
            >
              <Link href={`/books/${book.id}`} className="block flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-white">{formatDisplayTitle(book.title)}</p>
                    <p className="mt-1 text-xs text-white/50">
                      {book.pageCount} pages - {formatExtractionModeLabel(book.extractionMode)} - {formatStatusLabel(book.status)}
                    </p>
                  </div>
                  <span className="text-xs text-white/40">{new Date(book.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
              <button
                onClick={() => onDelete(book.id)}
                className="ml-4 shrink-0 rounded-xl border border-rose-400/30 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30"
                title="Delete book"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
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

function formatStatusLabel(status: string): string {
  if (status === "ready") return "Ready";
  return status;
}
