import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authGuard";
import { getBook, deleteBook } from "@/lib/bookService";
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ok = await deleteBook(auth.userId, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const book = await getBook(auth.userId, id);
  if (!book) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ book });
}
