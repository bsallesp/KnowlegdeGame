import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authGuard";
import { listBooks } from "@/lib/bookService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const books = await listBooks(auth.userId);
  return NextResponse.json({ books });
}
