import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authGuard";
import { BookNotReadyError, createStudyTopicFromBook } from "@/lib/bookStudy";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const result = await createStudyTopicFromBook(auth.userId, id);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof BookNotReadyError) {
      return NextResponse.json({ error: "book_not_ready" }, { status: 409 });
    }
    logger.error("books/to-topic", "Failed to create study topic", err);
    return NextResponse.json({ error: "topic_creation_failed" }, { status: 500 });
  }
}
