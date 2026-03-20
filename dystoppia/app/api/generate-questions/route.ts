import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Minimum cached questions before background refill kicks in
const REFILL_THRESHOLD = 8;
// How many questions to generate per background refill
const REFILL_BATCH = 5;

interface GeneratedQuestion {
  type: "multiple_choice" | "single_choice" | "fill_blank" | "true_false";
  content: string;
  options?: string[];
  answer: string;
  explanation: string;
  timeLimit?: number | null;
}

type TeachingProfile = {
  style: string;
  register: string;
  questionPatterns: string[];
  contextHint: string;
  exampleDomain: string;
  assessmentFocus: string;
};

type SubItemWithContext = {
  name: string;
  difficulty: number;
  item: {
    name: string;
    topic: {
      name: string;
      teachingProfile: string | null;
    };
  };
};

async function generateAndSaveQuestions(
  subItemId: string,
  subItem: SubItemWithContext,
  resolvedDifficulty: number,
  correctRate: number,
  count: number
): Promise<GeneratedQuestion[]> {
  let teachingProfile: TeachingProfile | null = null;
  if (subItem.item.topic.teachingProfile) {
    try {
      teachingProfile = JSON.parse(subItem.item.topic.teachingProfile);
    } catch {
      logger.warn("generate-questions", "Failed to parse teachingProfile JSON");
    }
  }

  const difficultyDescriptions: Record<number, string> = {
    1: "basic recall, simple definitions",
    2: "understanding concepts, explaining",
    3: "application, examples",
    4: "analysis, comparison, nuanced understanding",
    5: "synthesis, edge cases, expert-level",
  };

  const difficultyDesc = difficultyDescriptions[resolvedDifficulty] || "intermediate";

  const pedagogyBlock = teachingProfile
    ? `
PEDAGOGICAL APPROACH FOR THIS DOMAIN:
- Teaching style: ${teachingProfile.style}
- Register: ${teachingProfile.register}
- Assessment focus: ${teachingProfile.assessmentFocus}
- How to frame questions: ${teachingProfile.contextHint}
- Example domain to draw from: ${teachingProfile.exampleDomain}
- Question pattern templates (adapt freely):
${teachingProfile.questionPatterns.map((p) => `  • ${p}`).join("\n")}

Apply this pedagogical approach when writing all questions. The questions should feel native to this domain.`
    : "";

  if (teachingProfile) {
    logger.debug("generate-questions", `Using teaching profile: ${teachingProfile.style} / ${teachingProfile.assessmentFocus}`);
  }

  // Timer: all questions get a timer. Harder = less time (more pressure).
  // diff 1-2: 180s (3 min), diff 3: 150s (2.5 min), diff 4: 120s (2 min), diff 5: 120s (2 min)
  const timeLimitByDifficulty: Record<number, number> = { 1: 180, 2: 180, 3: 150, 4: 120, 5: 120 };
  const defaultTimeLimit = timeLimitByDifficulty[resolvedDifficulty] ?? 150;
  const timerInstruction = `- "timeLimit": use ${defaultTimeLimit} for multiple_choice, true_false, and single_choice. Use null for fill_blank.`;

  const prompt = `You are an expert educator creating quiz questions.

Topic: "${subItem.item.topic.name}"
Chapter: "${subItem.item.name}"
Concept: "${subItem.name}"

Difficulty level: ${resolvedDifficulty}/5 (${difficultyDesc})
Learner's current correct rate: ${Math.round(correctRate)}%
${pedagogyBlock}
Generate exactly ${count} questions about this concept. Use a mix of question types.

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "type": "multiple_choice",
      "content": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "explanation": "Explanation of why Option A is correct...",
      "timeLimit": null
    },
    {
      "type": "true_false",
      "content": "Statement to evaluate...",
      "options": ["True", "False"],
      "answer": "True",
      "explanation": "This is true because...",
      "timeLimit": null
    },
    {
      "type": "fill_blank",
      "content": "The process of ___ converts sunlight into energy.",
      "options": ["photosynthesis", "respiration", "fermentation"],
      "answer": "photosynthesis",
      "explanation": "Photosynthesis is the process by which plants convert sunlight into chemical energy.",
      "timeLimit": null
    }
  ]
}

Question type rules:
- "multiple_choice": 4 options, one correct
- "single_choice": 2-3 options, one correct
- "true_false": always options ["True", "False"]
- "fill_blank": content has ___ for the blank, provide 3-4 word/phrase options (word bank) including the correct answer; options should be plausible distractors from the same concept

timeLimit rules:
${timerInstruction}

Rules:
- All questions must be factually accurate
- Explanations should be educational and clear
- Difficulty ${resolvedDifficulty} means: ${difficultyDesc}
- No markdown in JSON strings, no newlines in strings
- Answer must exactly match one of the options (for choice questions)`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from LLM");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from LLM response");

  const parsed = JSON.parse(jsonMatch[0]);
  const generatedQuestions: GeneratedQuestion[] = parsed.questions;

  await Promise.all(
    generatedQuestions.map((q: GeneratedQuestion) =>
      prisma.question.create({
        data: {
          subItemId,
          type: q.type,
          content: q.content,
          options: q.options ? JSON.stringify(q.options) : null,
          answer: q.answer,
          explanation: q.explanation,
          difficulty: resolvedDifficulty,
          timeLimit: q.timeLimit ?? null,
        },
      })
    )
  );

  logger.info("generate-questions", `Saved ${generatedQuestions.length} new questions to DB`, { subItemId });
  return generatedQuestions;
}

export async function POST(req: NextRequest) {
  try {
    const { subItemId, difficulty, count = 3, stats } = await req.json();

    if (!subItemId) {
      return NextResponse.json({ error: "subItemId is required" }, { status: 400 });
    }

    const subItem = await prisma.subItem.findUnique({
      where: { id: subItemId },
      include: { item: { include: { topic: true } } },
    });

    if (!subItem) {
      return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
    }

    const resolvedDifficulty = difficulty || subItem.difficulty;
    const correctRate = stats?.totalCount > 0 ? (stats.correctCount / stats.totalCount) * 100 : 50;

    // Fetch cached questions
    const existingQuestions = await prisma.question.findMany({
      where: { subItemId, difficulty: resolvedDifficulty },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const validQuestions = existingQuestions.filter(
      (q) => q.type !== "fill_blank" || (q.options && q.options !== "[]" && q.options !== "null")
    );

    logger.info("generate-questions", `SubItem "${subItem.name}" — found ${validQuestions.length} cached, need ${count}`, { subItemId, difficulty: resolvedDifficulty });

    // Cache hit: return immediately
    if (validQuestions.length >= count) {
      logger.debug("generate-questions", `Cache hit — returning ${count} from DB (${validQuestions.length} cached)`);

      const shuffled = validQuestions.sort(() => Math.random() - 0.5).slice(0, count);

      // Background refill if cache is getting low
      if (validQuestions.length < REFILL_THRESHOLD) {
        logger.debug("generate-questions", `Cache low (${validQuestions.length}), refilling ${REFILL_BATCH} in background`);
        generateAndSaveQuestions(subItemId, subItem, resolvedDifficulty, correctRate, REFILL_BATCH).catch((err) =>
          logger.warn("generate-questions", "Background refill failed", err)
        );
      }

      return NextResponse.json({
        questions: shuffled.map((q) => ({
          ...q,
          options: q.options ? JSON.parse(q.options) : null,
        })),
      });
    }

    // Partial cache: return what we have + generate the rest in background
    if (validQuestions.length > 0) {
      logger.debug("generate-questions", `Partial cache (${validQuestions.length}) — returning now, generating ${REFILL_BATCH} in background`);

      generateAndSaveQuestions(subItemId, subItem, resolvedDifficulty, correctRate, REFILL_BATCH).catch((err) =>
        logger.warn("generate-questions", "Background refill failed", err)
      );

      return NextResponse.json({
        questions: validQuestions.map((q) => ({
          ...q,
          options: q.options ? JSON.parse(q.options) : null,
        })),
      });
    }

    // Cache empty: generate synchronously (unavoidable first time)
    logger.info("generate-questions", `Cache empty — generating ${count} questions synchronously`);
    const generated = await generateAndSaveQuestions(subItemId, subItem, resolvedDifficulty, correctRate, count);

    // Also kick off a larger batch in background to warm the cache for next time
    generateAndSaveQuestions(subItemId, subItem, resolvedDifficulty, correctRate, REFILL_BATCH).catch((err) =>
      logger.warn("generate-questions", "Post-generation background warmup failed", err)
    );

    return NextResponse.json({
      questions: generated.map((q) => ({
        type: q.type,
        content: q.content,
        options: q.options ?? null,
        answer: q.answer,
        explanation: q.explanation,
        timeLimit: q.timeLimit ?? null,
        subItemId,
        difficulty: resolvedDifficulty,
      })),
    });
  } catch (error) {
    logger.error("generate-questions", "Failed to generate questions", error);
    return NextResponse.json(
      { error: "Failed to generate questions", details: String(error) },
      { status: 500 }
    );
  }
}
