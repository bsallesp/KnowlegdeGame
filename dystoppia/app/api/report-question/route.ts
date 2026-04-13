import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import { replaySubItemProgress } from "@/lib/adaptive";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
    const subItemId = typeof body.subItemId === "string" ? body.subItemId.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim()
        : "Reported from the session UI";

    if (!questionId || !subItemId || !sessionId) {
      return NextResponse.json(
        { error: "questionId, subItemId, and sessionId are required" },
        { status: 400 }
      );
    }

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, subItemId: true, flaggedAt: true, flaggedReason: true },
    });

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (question.subItemId !== subItemId) {
      return NextResponse.json(
        { error: "Question does not belong to the provided subItem" },
        { status: 409 }
      );
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const activeAnswer = await tx.userAnswer.findFirst({
        where: { questionId, sessionId, invalidatedAt: null },
        orderBy: { createdAt: "desc" },
      });

      await tx.question.update({
        where: { id: questionId },
        data: {
          flaggedAt: question.flaggedAt ?? now,
          flaggedByUserId: auth.userId,
          flaggedReason: question.flaggedReason ?? reason,
          flaggedSessionId: sessionId,
        },
      });

      if (activeAnswer) {
        await tx.userAnswer.update({
          where: { id: activeAnswer.id },
          data: {
            invalidatedAt: now,
            invalidationReason: reason,
          },
        });
      }

      const validAnswers = await tx.userAnswer.findMany({
        where: { subItemId, invalidatedAt: null },
        select: {
          sessionId: true,
          correct: true,
          timeSpent: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });

      const replayed = replaySubItemProgress(validAnswers);

      const updatedSubItem = await tx.subItem.update({
        where: { id: subItemId },
        data: {
          difficulty: replayed.difficulty,
          easeFactor: replayed.easeFactor,
          reviewInterval: replayed.reviewInterval,
          nextReviewAt: replayed.nextReviewAt,
        },
        select: {
          difficulty: true,
          nextReviewAt: true,
        },
      });

      const sessionAnswers = await tx.userAnswer.findMany({
        where: { subItemId, sessionId, invalidatedAt: null },
        select: { correct: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      const totalCount = sessionAnswers.length;
      const correctCount = sessionAnswers.filter((answer) => answer.correct).length;

      return {
        answerInvalidated: Boolean(activeAnswer),
        flaggedAt: (question.flaggedAt ?? now).toISOString(),
        nextReviewAt: (updatedSubItem.nextReviewAt ?? new Date(0)).toISOString(),
        stats: {
          correctCount,
          totalCount,
          difficulty: updatedSubItem.difficulty,
          lastSeen: sessionAnswers[0]?.createdAt.toISOString(),
        },
      };
    });

    logger.info("report-question", "Question flagged from session", {
      questionId,
      subItemId,
      sessionId,
      answerInvalidated: result.answerInvalidated,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error("report-question", "Failed to flag question", error);
    return NextResponse.json(
      { error: "Failed to report question", details: String(error) },
      { status: 500 }
    );
  }
}
