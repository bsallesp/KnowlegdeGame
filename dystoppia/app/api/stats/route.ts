import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const topicId = req.nextUrl.searchParams.get("topicId");

  if (!topicId) {
    return NextResponse.json({ error: "topicId is required" }, { status: 400 });
  }

  try {
    const subItems = await prisma.subItem.findMany({
      where: { item: { topicId } },
      include: {
        answers: {
          where: { invalidatedAt: null },
          select: { correct: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const stats: Record<
      string,
      { correctCount: number; totalCount: number; difficulty: number; lastSeen?: string }
    > = {};

    for (const sub of subItems) {
      const total = sub.answers.length;
      const correct = sub.answers.filter((a) => a.correct).length;
      stats[sub.id] = {
        correctCount: correct,
        totalCount: total,
        difficulty: sub.difficulty,
        lastSeen: sub.answers[0]?.createdAt.toISOString(),
      };
    }

    return NextResponse.json({ stats });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
