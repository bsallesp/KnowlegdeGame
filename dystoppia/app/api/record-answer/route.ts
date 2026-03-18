import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateNewDifficulty, calculateSM2 } from "@/lib/adaptive";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { questionId, subItemId, sessionId, correct, timeSpent } = await req.json();

    if (!questionId || !subItemId || !sessionId) {
      logger.warn("record-answer", "Missing required fields", { questionId, subItemId, sessionId });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    logger.debug("record-answer", `Answer received`, { questionId, subItemId, correct, timeSpent });

    // Save the answer
    await prisma.userAnswer.create({
      data: {
        questionId,
        subItemId,
        sessionId,
        correct: Boolean(correct),
        timeSpent: timeSpent || 0,
      },
    });

    // Get recent answers for this subItem to update difficulty
    const recentAnswers = await prisma.userAnswer.findMany({
      where: { subItemId, sessionId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentCorrect = recentAnswers.filter((a) => a.correct).length;
    const recentTotal = recentAnswers.length;

    // Get current difficulty and SM-2 fields
    const subItem = await prisma.subItem.findUnique({
      where: { id: subItemId },
      select: { difficulty: true, easeFactor: true, reviewInterval: true },
    });

    if (!subItem) {
      return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
    }

    const newDifficulty = calculateNewDifficulty(
      subItem.difficulty,
      recentCorrect,
      recentTotal
    );

    // Calculate SM-2 values (expected time: 15 seconds = 15000ms)
    const sm2 = calculateSM2(
      subItem.easeFactor,
      subItem.reviewInterval,
      Boolean(correct),
      timeSpent || 0,
      15000
    );

    // Update subItem with new difficulty and SM-2 values
    await prisma.subItem.update({
      where: { id: subItemId },
      data: {
        difficulty: newDifficulty,
        easeFactor: sm2.easeFactor,
        reviewInterval: sm2.reviewInterval,
        nextReviewAt: sm2.nextReviewAt,
      },
    });

    if (newDifficulty !== subItem.difficulty) {
      logger.info("record-answer", `Difficulty changed`, { subItemId, from: subItem.difficulty, to: newDifficulty });
    }

    // Get all stats for this subItem
    const allAnswers = await prisma.userAnswer.findMany({
      where: { subItemId, sessionId },
    });

    const totalCount = allAnswers.length;
    const correctCount = allAnswers.filter((a) => a.correct).length;

    return NextResponse.json({
      success: true,
      newDifficulty,
      nextReviewAt: sm2.nextReviewAt.toISOString(),
      stats: {
        correctCount,
        totalCount,
        difficulty: newDifficulty,
      },
    });
  } catch (error) {
    logger.error("record-answer", "Failed to record answer", error);
    return NextResponse.json(
      { error: "Failed to record answer", details: String(error) },
      { status: 500 }
    );
  }
}
