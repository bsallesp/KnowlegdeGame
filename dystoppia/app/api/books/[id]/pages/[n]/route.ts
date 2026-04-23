import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authGuard";
import { getBookPage } from "@/lib/bookService";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; n: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { id, n } = await ctx.params;
  const pageNumber = Number.parseInt(n, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "invalid_page_number" }, { status: 400 });
  }

  const page = await getBookPage(auth.userId, id, pageNumber);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ page });
}
