import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const daysParam = req.nextUrl.searchParams.get("days") ?? "30";
  const days = Math.min(Math.max(1, parseInt(daysParam, 10) || 30), 365);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const [summary, byEndpoint, byModel, dailyLogs, recentLogs] = await Promise.all([
    prisma.lLMUsageLog.aggregate({
      where: { createdAt: { gte: startDate } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true, characters: true },
      _count: { id: true },
    }),

    prisma.lLMUsageLog.groupBy({
      by: ["endpoint"],
      where: { createdAt: { gte: startDate } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { id: true },
      orderBy: { _sum: { costUsd: "desc" } },
    }),

    prisma.lLMUsageLog.groupBy({
      by: ["model"],
      where: { createdAt: { gte: startDate } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: { id: true },
      orderBy: { _sum: { costUsd: "desc" } },
    }),

    // All logs in window (cost + date only) for daily chart
    prisma.lLMUsageLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { costUsd: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),

    // Recent detailed logs
    prisma.lLMUsageLog.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        model: true,
        endpoint: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        createdAt: true,
      },
    }),
  ]);

  // Build daily breakdown
  const dailyMap = new Map<string, { costUsd: number; calls: number }>();
  for (const log of dailyLogs) {
    const day = log.createdAt.toISOString().split("T")[0];
    const prev = dailyMap.get(day) ?? { costUsd: 0, calls: 0 };
    dailyMap.set(day, { costUsd: prev.costUsd + log.costUsd, calls: prev.calls + 1 });
  }

  const byDay = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split("T")[0];
    return { date: dateStr, ...(dailyMap.get(dateStr) ?? { costUsd: 0, calls: 0 }) };
  });

  return NextResponse.json({
    days,
    summary: {
      totalCostUsd: summary._sum.costUsd ?? 0,
      totalCalls: summary._count.id,
      totalInputTokens: summary._sum.inputTokens ?? 0,
      totalOutputTokens: summary._sum.outputTokens ?? 0,
    },
    byEndpoint: byEndpoint.map((e) => ({
      endpoint: e.endpoint,
      calls: e._count.id,
      costUsd: e._sum.costUsd ?? 0,
      inputTokens: e._sum.inputTokens ?? 0,
      outputTokens: e._sum.outputTokens ?? 0,
    })),
    byModel: byModel.map((m) => ({
      model: m.model,
      calls: m._count.id,
      costUsd: m._sum.costUsd ?? 0,
      inputTokens: m._sum.inputTokens ?? 0,
      outputTokens: m._sum.outputTokens ?? 0,
    })),
    byDay,
    recent: recentLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
