import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface GeneratedQuestion {
  type: "multiple_choice" | "single_choice" | "fill_blank" | "true_false";
  content: string;
  options?: string[];
  answer: string;
  explanation: string;
  timeLimit?: number | null;
}

export async function POST(req: NextRequest) {
  try {
    const { subItemId, difficulty, count = 3, stats } = await req.json();

    if (!subItemId) {
      return NextResponse.json({ error: "subItemId is required" }, { status: 400 });
    }

    // Fetch the subItem with its parent context
    const subItem = await prisma.subItem.findUnique({
      where: { id: subItemId },
      include: {
        item: {
          include: {
            topic: true,
          },
        },
      },
    });

    if (!subItem) {
      return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
    }

    // Check for existing questions in DB at this difficulty
    const existingQuestions = await prisma.question.findMany({
      where: {
        subItemId,
        difficulty: difficulty || subItem.difficulty,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const resolvedDifficulty = difficulty || subItem.difficulty;
    logger.info("generate-questions", `SubItem "${subItem.name}" — found ${existingQuestions.length} cached, need ${count}`, { subItemId, difficulty: resolvedDifficulty });

    // If we have enough cached questions, return them
    if (existingQuestions.length >= count) {
      logger.debug("generate-questions", `Cache hit — returning ${count} questions from DB`);
      const shuffled = existingQuestions.sort(() => Math.random() - 0.5).slice(0, count);
      return NextResponse.json({
        questions: shuffled.map((q) => ({
          ...q,
          options: q.options ? JSON.parse(q.options) : null,
        })),
      });
    }

    const currentDifficulty = difficulty || subItem.difficulty;
    const correctRate = stats?.totalCount > 0 ? (stats.correctCount / stats.totalCount) * 100 : 50;
    const useTimer = currentDifficulty >= 4;

    // Parse teaching profile from topic
    type TeachingProfile = {
      style: string;
      register: string;
      questionPatterns: string[];
      contextHint: string;
      exampleDomain: string;
      assessmentFocus: string;
    };
    let teachingProfile: TeachingProfile | null = null;
    if (subItem.item.topic.teachingProfile) {
      try {
        teachingProfile = JSON.parse(subItem.item.topic.teachingProfile);
      } catch {
        logger.warn("generate-questions", "Failed to parse teachingProfile JSON");
      }
    }

    const difficultyDescriptions = {
      1: "basic recall, simple definitions",
      2: "understanding concepts, explaining",
      3: "application, examples",
      4: "analysis, comparison, nuanced understanding",
      5: "synthesis, edge cases, expert-level",
    };

    const difficultyDesc =
      difficultyDescriptions[currentDifficulty as keyof typeof difficultyDescriptions] || "intermediate";

    // Build pedagogy block from teaching profile
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

    const timerInstruction = useTimer
      ? `- "timeLimit": include 30 for multiple_choice/true_false at difficulty 4, and 45 for difficulty 5. Use null for fill_blank and single_choice.`
      : `- "timeLimit": always null (no timer for difficulty < 4)`;

    const prompt = `You are an expert educator creating quiz questions.

Topic: "${subItem.item.topic.name}"
Chapter: "${subItem.item.name}"
Concept: "${subItem.name}"

Difficulty level: ${currentDifficulty}/5 (${difficultyDesc})
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
- Difficulty ${currentDifficulty} means: ${difficultyDesc}
- No markdown in JSON strings, no newlines in strings
- Answer must exactly match one of the options (for choice questions)`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from LLM");
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from LLM response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const generatedQuestions: GeneratedQuestion[] = parsed.questions;

    // Save to database
    const savedQuestions = await Promise.all(
      generatedQuestions.map((q: GeneratedQuestion) =>
        prisma.question.create({
          data: {
            subItemId,
            type: q.type,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            answer: q.answer,
            explanation: q.explanation,
            difficulty: currentDifficulty,
            timeLimit: q.timeLimit ?? null,
          },
        })
      )
    );

    logger.info("generate-questions", `Saved ${savedQuestions.length} new questions to DB`, { subItemId });
    return NextResponse.json({
      questions: savedQuestions.map((q) => ({
        ...q,
        options: q.options ? JSON.parse(q.options) : null,
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
