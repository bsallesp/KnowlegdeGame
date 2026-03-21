import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");

  try {
    if (slug) {
      // Return a single full topic by slug (for resuming a session)
      const topic = await prisma.topic.findUnique({
        where: { slug },
        include: {
          items: {
            orderBy: { order: "asc" },
            include: {
              subItems: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      });

      if (!topic) {
        return NextResponse.json({ error: "Topic not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        createdAt: topic.createdAt.toISOString(),
        teachingProfile: topic.teachingProfile ? JSON.parse(topic.teachingProfile as string) : null,
        items: topic.items.map((item) => ({
          id: item.id,
          topicId: item.topicId,
          name: item.name,
          order: item.order,
          muted: item.muted,
          subItems: item.subItems.map((sub) => ({
            id: sub.id,
            itemId: sub.itemId,
            name: sub.name,
            order: sub.order,
            muted: sub.muted,
            difficulty: sub.difficulty,
          })),
        })),
      });
    }

    // Return summary list of all topics
    const topics = await prisma.topic.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            subItems: {
              include: {
                answers: {
                  select: { correct: true },
                },
              },
            },
          },
        },
      },
    });

    const result = topics.map((topic) => {
      const allAnswers = topic.items.flatMap((item) =>
        item.subItems.flatMap((sub) => sub.answers)
      );
      const totalAnswers = allAnswers.length;
      const correctAnswers = allAnswers.filter((a) => a.correct).length;

      return {
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        createdAt: topic.createdAt,
        totalAnswers,
        correctRate: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : null,
      };
    });

    return NextResponse.json({ topics: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
