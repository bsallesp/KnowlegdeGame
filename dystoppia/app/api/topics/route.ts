import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
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
