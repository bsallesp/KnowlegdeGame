"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const form = e.currentTarget;
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">Your Books</h1>

      <form
        onSubmit={onUpload}
        className="mb-8 rounded-lg border border-white/10 p-4 bg-white/5 flex flex-col gap-3"
      >
        <label className="text-sm text-white/70">
          Upload a book (PDF, EPUB, TXT, or image)
        </label>
        <input
          name="file"
          type="file"
          accept=".pdf,.epub,.txt,.png,.jpg,.jpeg,.webp,.tiff,application/pdf,application/epub+zip,text/plain,image/*"
          className="text-sm"
          required
        />
        <input
          name="title"
          type="text"
          placeholder="Title (optional — uses filename otherwise)"
          className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm"
          maxLength={300}
        />
        <button
          type="submit"
          disabled={uploading}
          className="self-start rounded bg-cyan-500/20 text-cyan-100 border border-cyan-400/30 px-4 py-2 text-sm hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {uploading ? "Processing…" : "Upload & process"}
        </button>
        {error ? <p className="text-sm text-rose-300">Error: {error}</p> : null}
      </form>

      {books === null ? (
        <p className="text-white/50 text-sm">Loading…</p>
      ) : books.length === 0 ? (
        <p className="text-white/50 text-sm">No books uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-lg border border-white/10 overflow-hidden">
          {books.map((b) => (
            <li key={b.id} className="px-4 py-3 bg-white/5 hover:bg-white/10 transition">
              <Link href={`/books/${b.id}`} className="block">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.title}</p>
                    <p className="text-xs text-white/50 mt-0.5">
                      {b.pageCount} pages · {b.mimeType} ·{" "}
                      {b.extractionMode ?? "unknown"} · {b.status}
                    </p>
                  </div>
                  <span className="text-xs text-white/40">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
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
