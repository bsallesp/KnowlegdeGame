import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateNewDifficulty, calculateSM2 } from "@/lib/adaptive";
import { logger } from "@/lib/logger";

const MAX_SUBITEM_UPDATE_RETRIES = 5;

async function buildSuccessResponse(subItemId: string, sessionId: string) {
  const subItem = await prisma.subItem.findUnique({
    where: { id: subItemId },
    select: { difficulty: true, nextReviewAt: true },
  });
  if (!subItem) {
    return null;
  }

  const allAnswers = await prisma.userAnswer.findMany({
    where: { subItemId, sessionId, invalidatedAt: null },
  });
  const totalCount = allAnswers.length;
  const correctCount = allAnswers.filter((a) => a.correct).length;

  return {
    success: true,
    newDifficulty: subItem.difficulty,
    nextReviewAt: (subItem.nextReviewAt ?? new Date(0)).toISOString(),
    stats: {
      correctCount,
      totalCount,
      difficulty: subItem.difficulty,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { questionId, subItemId, sessionId, correct, timeSpent, idempotencyKey: rawKey } = body;
    const idempotencyKey =
      typeof rawKey === "string" && rawKey.trim().length > 0 ? rawKey.trim() : undefined;

    if (!questionId || !subItemId || !sessionId) {
      logger.warn("record-answer", "Missing required fields", { questionId, subItemId, sessionId });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    logger.debug("record-answer", `Answer received`, { questionId, subItemId, correct, timeSpent });

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { subItemId: true, flaggedAt: true, timeLimit: true },
    });

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    if (question.subItemId !== subItemId) {
      return NextResponse.json({ error: "Question does not belong to the provided subItem" }, { status: 409 });
    }

    if (idempotencyKey) {
      const existing = await prisma.userAnswer.findUnique({
        where: {
          sessionId_idempotencyKey: { sessionId, idempotencyKey },
        },
      });
      if (existing) {
        if (existing.questionId !== questionId || existing.subItemId !== subItemId) {
          logger.warn("record-answer", "Idempotency key reused for different answer", {
            sessionId,
            idempotencyKey,
          });
          return NextResponse.json(
            { error: "Idempotency key already used for a different answer" },
            { status: 409 }
          );
        }
        const payload = await buildSuccessResponse(subItemId, sessionId);
        if (!payload) {
          return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
        }
        return NextResponse.json(payload);
      }
    }

    if (question.flaggedAt) {
      const payload = await buildSuccessResponse(subItemId, sessionId);
      if (!payload) {
        return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
      }
      return NextResponse.json({
        ...payload,
        ignoredFlaggedQuestion: true,
      });
    }

    // Save the answer
    await prisma.userAnswer.create({
      data: {
        questionId,
        subItemId,
        sessionId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        correct: Boolean(correct),
        timeSpent: timeSpent || 0,
      },
    });

    // Get recent answers for this subItem to update difficulty
    const recentAnswers = await prisma.userAnswer.findMany({
      where: { subItemId, sessionId, invalidatedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentCorrect = recentAnswers.filter((a) => a.correct).length;
    const recentTotal = recentAnswers.length;

    // Get current difficulty and SM-2 fields
    let subItem = await prisma.subItem.findUnique({
      where: { id: subItemId },
      select: { difficulty: true, easeFactor: true, reviewInterval: true },
    });

    if (!subItem) {
      return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
    }

    const initialDifficulty = subItem.difficulty;
    let appliedDifficulty = subItem.difficulty;
    let appliedSm2: ReturnType<typeof calculateSM2> | null = null;

    for (let attempt = 0; attempt < MAX_SUBITEM_UPDATE_RETRIES; attempt++) {
      const newDifficulty = calculateNewDifficulty(
        subItem.difficulty,
        recentCorrect,
        recentTotal,
        {
          lastCorrect: Boolean(correct),
          lastTimeSpent: timeSpent || 0,
          lastExpectedTime: question.timeLimit ? question.timeLimit * 1000 : 15000,
        }
      );

      // Calculate SM-2 values (expected time: 15 seconds = 15000ms)
      const sm2 = calculateSM2(
        subItem.easeFactor,
        subItem.reviewInterval,
        Boolean(correct),
        timeSpent || 0,
        15000
      );

      // CAS update prevents lost updates when two requests race on the same subItem.
      const result = await prisma.subItem.updateMany({
        where: {
          id: subItemId,
          difficulty: subItem.difficulty,
          easeFactor: subItem.easeFactor,
          reviewInterval: subItem.reviewInterval,
        },
        data: {
          difficulty: newDifficulty,
          easeFactor: sm2.easeFactor,
          reviewInterval: sm2.reviewInterval,
          nextReviewAt: sm2.nextReviewAt,
        },
      });

      if (result.count === 1) {
        appliedDifficulty = newDifficulty;
        appliedSm2 = sm2;
        break;
      }

      const latest = await prisma.subItem.findUnique({
        where: { id: subItemId },
        select: { difficulty: true, easeFactor: true, reviewInterval: true },
      });

      if (!latest) {
        return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
      }

      subItem = latest;
    }

    if (!appliedSm2) {
      throw new Error("Concurrent subItem update conflict");
    }

    if (appliedDifficulty !== initialDifficulty) {
      logger.info("record-answer", `Difficulty changed`, { subItemId, from: initialDifficulty, to: appliedDifficulty });
    }

    const payload = await buildSuccessResponse(subItemId, sessionId);
    if (!payload) {
      return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...payload,
      newDifficulty: appliedDifficulty,
      nextReviewAt: appliedSm2.nextReviewAt.toISOString(),
      stats: {
        ...payload.stats,
        difficulty: appliedDifficulty,
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
