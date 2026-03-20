import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const topicId = searchParams.get("topicId");
    const days = parseInt(searchParams.get("days") || "30", 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = topicId
      ? {
          createdAt: { gte: since },
          subItem: { item: { topicId } },
        }
      : { createdAt: { gte: since } };

    const answers = await prisma.userAnswer.findMany({
      where,
      select: { correct: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Group by date (YYYY-MM-DD)
    const byDate: Record<string, { correct: number; total: number }> = {};
    for (const a of answers) {
      const date = a.createdAt.toISOString().split("T")[0];
      if (!byDate[date]) byDate[date] = { correct: 0, total: 0 };
      byDate[date].total++;
      if (a.correct) byDate[date].correct++;
    }

    const history = Object.entries(byDate).map(([date, { correct, total }]) => ({
      date,
      correct,
      total,
      rate: total > 0 ? Math.round((correct / total) * 100) : 0,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch progress", details: String(error) }, { status: 500 });
  }
}
