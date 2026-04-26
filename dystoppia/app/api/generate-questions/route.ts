import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireUser } from "@/lib/authGuard";
import { checkRateLimit, RateLimitError } from "@/lib/rateLimit";
import { logLLMUsage } from "@/lib/llmLogger";
import {
  SourceContextAccessError,
  getSourceContextForSubItem,
  type BookSourceContext,
} from "@/lib/bookSourceText";
import { getDifficultyDescription, getLearningStage } from "@/lib/learningStage";

// Primary provider: OpenAI (cheaper). Fallback: Anthropic for hard questions.
// Easy (d0-2): gpt-4o-mini  ~$0.15/$0.60 per MTok
// Hard (d3-5): claude-sonnet ~$3/$15 per MTok (needs nuance/reasoning)
const OPENAI_MODEL_EASY = "gpt-4o-mini";
const ANTHROPIC_MODEL_HARD = "claude-sonnet-4-6";
const OPENAI_MODEL_VALIDATION = "gpt-4o-mini";

function getProviderAndModel(difficulty: number): { provider: "openai" | "anthropic"; model: string } {
  return difficulty <= 2
    ? { provider: "openai", model: OPENAI_MODEL_EASY }
    : { provider: "anthropic", model: ANTHROPIC_MODEL_HARD };
}

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function hasGenerationApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim()) || Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

class QuestionGenerationConfigError extends Error {
  constructor() {
    super("Question generation is not configured");
    this.name = "QuestionGenerationConfigError";
  }
}

function shuffleOptions(options: string[] | null, type: string): string[] | null {
  if (!options || type === "true_false") return options;
  return [...options].sort(() => Math.random() - 0.5);
}

// Minimum cached questions before background refill kicks in
const REFILL_THRESHOLD = 25;
// How many questions to generate per background refill
const REFILL_BATCH = 20;
// Cap per-subItem cache depth on prefetch warmups to avoid runaway LLM spend
const PREFETCH_CACHE_TARGET = 30;
const MAX_GENERATION_ATTEMPTS = 3;
// OpenAI: 8K is enough for 20 easy questions (short stems, simple options).
// Anthropic: hard questions (d3-5) are longer — 16K prevents truncation on REFILL_BATCH.
const GENERATION_MAX_TOKENS_OPENAI = 8000;
const GENERATION_MAX_TOKENS_ANTHROPIC = 16000;

interface GeneratedQuestion {
  type: "multiple_choice" | "single_choice" | "fill_blank" | "true_false";
  content: string;
  options?: string[];
  answer: string;
  explanation: string;
  primer?: string | null;
  fact?: string | null;
  timeLimit?: number | null;
}

interface SavedQuestion extends GeneratedQuestion {
  id: string;
  subItemId: string;
  difficulty: number;
  createdAt: Date;
}

interface ValidationBatchResponse {
  results?: Array<{
    index: number;
    consistent: boolean;
    reason?: string;
  }>;
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

function extractTextContent(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseJsonPayload<T>(rawText: string): T {
  const fenceStripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const jsonMatch = fenceStripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error("generate-questions", "No JSON object found in LLM response", { preview: rawText.slice(0, 500) });
    throw new Error("Could not parse JSON from LLM response");
  }
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (err) {
    logger.error("generate-questions", "JSON.parse failed on LLM response", {
      error: String(err),
      length: rawText.length,
      tail: rawText.slice(-300),
    });
    throw err;
  }
}

function normalizeQuestion(raw: GeneratedQuestion): GeneratedQuestion | null {
  if (!raw || typeof raw !== "object") return null;

  const normalizedType = raw.type;
  if (!["multiple_choice", "single_choice", "fill_blank", "true_false"].includes(normalizedType)) {
    return null;
  }

  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
  const primer = typeof raw.primer === "string" ? raw.primer.trim() : "";
  const fact = typeof raw.fact === "string" && raw.fact.trim().length > 0 ? raw.fact.trim() : null;
  let answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
  let options = Array.isArray(raw.options)
    ? raw.options
        .map((option) => (typeof option === "string" ? option.trim() : ""))
        .filter(Boolean)
    : undefined;

  if (!content || !answer || !explanation) {
    return null;
  }

  if (normalizedType === "true_false") {
    const answerLower = answer.toLowerCase();
    if (answerLower !== "true" && answerLower !== "false") {
      return null;
    }
    answer = answerLower === "true" ? "True" : "False";
    options = ["True", "False"];
  }

  if (normalizedType === "multiple_choice" && (!options || options.length !== 4 || !options.includes(answer))) {
    return null;
  }

  if (normalizedType === "single_choice" && (!options || options.length < 2 || options.length > 3 || !options.includes(answer))) {
    return null;
  }

  if (normalizedType === "fill_blank") {
    if (!content.includes("___") || !options || options.length < 3 || options.length > 4 || !options.includes(answer)) {
      return null;
    }
  }

  const timeLimit = typeof raw.timeLimit === "number" ? raw.timeLimit : null;

  return {
    type: normalizedType,
    content,
    options,
    answer,
    explanation,
    primer: primer || null,
    fact,
    timeLimit,
  };
}

function buildStagePrimerInstruction(resolvedDifficulty: number, correctRate: number): string {
  const stage = getLearningStage(resolvedDifficulty, correctRate);
  return `LEARNING STAGE = ${stage.label.toUpperCase()}.
  ${stage.primerGuidance}
  Never reveal or paraphrase the exact answer to the actual question.`;
}

function buildQuestionWritingInstruction(resolvedDifficulty: number, correctRate: number): string {
  const stage = getLearningStage(resolvedDifficulty, correctRate);

  return `QUESTION-WRITING STRATEGY FOR THIS LEARNER:
- Current stage: ${stage.label}
- Learner goal: ${stage.learnerGoal}
- Authoring focus: ${stage.promptFocus}
- Match the wording complexity to this stage before increasing scenario complexity.
- If the learner is in ${stage.label}, do not accidentally write a harder-stage question just because the concept allows it.
- Difficulty 1-2 must feel welcoming and low-friction: short stems, one idea at a time, and distractors based on common beginner confusions.`;
}

function buildGenerationPrompt(
  subItem: SubItemWithContext,
  resolvedDifficulty: number,
  correctRate: number,
  count: number,
  pedagogyBlock: string,
  difficultyDesc: string,
  timerInstruction: string,
  sourceContext: BookSourceContext | null = null
): string {
  const sourceBlock = sourceContext
    ? `
SOURCE MATERIAL FROM THE USER'S UPLOADED BOOK
Book: "${sourceContext.bookTitle}"
Pages: ${sourceContext.pageStart}-${sourceContext.pageEnd}

${sourceContext.text}

Source-grounding rules:
- Use the source material above as the authority for every generated question.
- Do not introduce outside facts, dates, product behavior, or definitions unless they are explicitly present in the source material.
- Explanations must point back to the source wording or page context.
- If the source material is thin, ask narrower questions about what is present instead of filling gaps from general knowledge.
`
    : "";

  const primerInstruction = buildStagePrimerInstruction(resolvedDifficulty, correctRate);
  const questionWritingInstruction = buildQuestionWritingInstruction(resolvedDifficulty, correctRate);
  const stage = getLearningStage(resolvedDifficulty, correctRate);

  const isPreflightMode = resolvedDifficulty === 0;

  const preflightBlock = isPreflightMode
    ? `
PREFLIGHT MODE — this is the learner's very first contact with this concept:
- Question types: ONLY "true_false" or "single_choice" (2-3 options). No multiple_choice, no fill_blank.
- Test pure vocabulary recognition: "What does X mean?", "Which of these is X?", "X is true/false."
- Options must be completely obvious — no tricky distractors, no close alternatives.
- Stems must be under 12 words. No scenarios, no prior knowledge required.
- The primer must be 1-2 sentences: name the concept, give the shortest accurate definition, nothing else.
- These questions are diagnostic: reveal whether the learner has seen this concept before.
- timeLimit: null for all preflight questions.
`
    : "";

  return `You are an expert educator creating quiz questions. All questions, options, answers, explanations, and primers must be written in English.

Topic: "${subItem.item.topic.name}"
Chapter: "${subItem.item.name}"
Concept: "${subItem.name}"

Difficulty level: ${resolvedDifficulty}/5 (${difficultyDesc})
Learner's current correct rate: ${Math.round(correctRate)}%
Current learning stage: ${stage.label}
${preflightBlock}
${pedagogyBlock}
${sourceBlock}
Generate exactly ${count} questions about this concept.${isPreflightMode ? " Use only true_false and single_choice types." : " Use a mix of question types."}

${questionWritingInstruction}

Question design rules by stage:
- Orientation (difficulty 0): pure vocabulary recognition, true/false, completely obvious options. No scenarios.
- Recognize: use definition, term-to-cue, and simple true/false checks. Avoid decorative scenarios.
- Explain: ask why a rule fits, what a phrase means, or which option best explains the concept.
- Apply: use one short scenario with one decision point.
- Compare: use close alternatives and make the deciding detail matter.
- Transfer: use nuanced scenarios, edge cases, or synthesis.

PRIMER (pre-question teaching text) — required for every question:
${primerInstruction}
Pearson-VUE style: the primer teaches the principle so the learner can REASON toward the answer, never hands the answer over. If the question uses specific numbers, entities, or a scenario, the primer's example must use DIFFERENT ones.

FACT — required for every question:
Write a single surprising, real-world, or memory-anchor fact about the broader topic (not about this specific question). Max 2 sentences. Prefer: counterintuitive truths, historical context, real-world applications, or mnemonic hooks. The fact must NOT hint at or reveal the current question's answer. It should make the learner feel the topic is alive and interesting.
Examples of good facts: "Zero was not always used — ancient civilizations did all their math without it." / "An index can speed up searches dramatically, but may slow down inserts." / "Cleopatra lived closer in time to the iPhone than to the pyramids."

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "type": "multiple_choice",
      "content": "Question text here?",
      "options": ["Option B", "Option C", "Option A", "Option D"],
      "answer": "Option A",
      "explanation": "Explanation of why Option A is correct...",
      "primer": "Short didactic text that teaches the principle using a different example than the question.",
      "fact": "One surprising or memorable fact about the broader topic. 1-2 sentences.",
      "timeLimit": null
    },
    {
      "type": "true_false",
      "content": "Statement to evaluate...",
      "options": ["True", "False"],
      "answer": "True",
      "explanation": "This is true because...",
      "primer": "Short didactic text that teaches the principle using a different example than the question.",
      "fact": "One surprising or memorable fact about the broader topic. 1-2 sentences.",
      "timeLimit": null
    },
    {
      "type": "fill_blank",
      "content": "The process of ___ converts sunlight into energy.",
      "options": ["respiration", "photosynthesis", "fermentation"],
      "answer": "photosynthesis",
      "explanation": "Photosynthesis is the process by which plants convert sunlight into chemical energy.",
      "primer": "Short didactic text that teaches the principle using a different example than the question.",
      "fact": "One surprising or memorable fact about the broader topic. 1-2 sentences.",
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
- The explanation should name the cue, rule, or contrast that should have driven the learner's choice
- No markdown in JSON strings, no newlines in strings
- Answer must exactly match one of the options (for choice questions)
- Randomize the position of the correct answer within the options array — do NOT always put it first
- For any arithmetic or numeric claim, compute the result before finalizing the answer
- The explanation must support the exact final answer. Never let the explanation contradict the answer
- If the explanation proves a true/false statement is false, the answer must be "False"
- The primer must never leak the specific answer — if it would, rewrite it to teach only the principle
- The fact must be true, interesting, and completely independent of the specific question being asked`;
}

async function requestQuestionBatch(prompt: string, userId: string, difficulty: number): Promise<GeneratedQuestion[]> {
  const { provider, model } = getProviderAndModel(difficulty);

  if (provider === "openai") {
    const response = await openaiClient.chat.completions.create({
      model,
      max_tokens: GENERATION_MAX_TOKENS_OPENAI,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.choices[0].finish_reason === "length") {
      logger.warn("generate-questions", "OpenAI generation hit max_tokens — response likely truncated");
    }

    logLLMUsage({
      userId,
      model,
      endpoint: "generate-questions",
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    const raw = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as { questions?: GeneratedQuestion[] };
    if (!Array.isArray(parsed.questions)) {
      throw new Error("OpenAI response did not include a questions array");
    }
    return parsed.questions;
  }

  // Anthropic path (hard questions, d3–5)
  const message = await anthropicClient.messages.create({
    model,
    max_tokens: GENERATION_MAX_TOKENS_ANTHROPIC,
    messages: [{ role: "user", content: prompt }],
  });

  if (message.stop_reason === "max_tokens") {
    logger.warn("generate-questions", "Anthropic generation hit max_tokens — response likely truncated");
  }

  logLLMUsage({
    userId,
    model,
    endpoint: "generate-questions",
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const parsed = parseJsonPayload<{ questions?: GeneratedQuestion[] }>(extractTextContent(message));
  if (!Array.isArray(parsed.questions)) {
    throw new Error("Anthropic response did not include a questions array");
  }
  return parsed.questions;
}

async function validateGeneratedQuestions(
  questions: GeneratedQuestion[],
  userId: string
): Promise<GeneratedQuestion[]> {
  const normalizedEntries = questions
    .map((question, index) => ({ index, question: normalizeQuestion(question) }))
    .filter((entry): entry is { index: number; question: GeneratedQuestion } => entry.question !== null);

  if (normalizedEntries.length === 0) {
    return [];
  }

  const validationPrompt = `You are validating whether quiz answers match their own explanations.

For each question below, determine whether the explanation supports the answer.
- Recompute arithmetic yourself when numbers are involved.
- Reject any item where the explanation contradicts the answer, even if the rest looks plausible.
- Be strict about true/false math statements.

Return ONLY valid JSON in this shape:
{
  "results": [
    { "index": 0, "consistent": true, "reason": "short reason" }
  ]
}

Questions:
${JSON.stringify(
  normalizedEntries.map((entry) => ({
    index: entry.index,
    type: entry.question.type,
    content: entry.question.content,
    options: entry.question.options ?? [],
    answer: entry.question.answer,
    explanation: entry.question.explanation,
  }))
)}`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL_VALIDATION,
      max_tokens: Math.max(500, normalizedEntries.length * 140),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: validationPrompt }],
    });

    logLLMUsage({
      userId,
      model: OPENAI_MODEL_VALIDATION,
      endpoint: "generate-questions-verify",
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as ValidationBatchResponse;
    const resultMap = new Map<number, { consistent: boolean; reason?: string }>();

    if (Array.isArray(parsed.results)) {
      for (const result of parsed.results) {
        if (typeof result.index === "number" && typeof result.consistent === "boolean") {
          resultMap.set(result.index, {
            consistent: result.consistent,
            reason: result.reason,
          });
        }
      }
    }

    if (resultMap.size === 0) {
      logger.warn("generate-questions", "Validator returned no usable decisions; falling back to local validation");
      return normalizedEntries.map((entry) => entry.question);
    }

    return normalizedEntries
      .filter((entry) => {
        const verdict = resultMap.get(entry.index);
        if (!verdict || verdict.consistent) {
          return true;
        }
        logger.warn("generate-questions", "Rejected inconsistent generated question", {
          content: entry.question.content,
          reason: verdict.reason ?? "validator marked inconsistent",
        });
        return false;
      })
      .map((entry) => entry.question);
  } catch (error) {
    logger.warn("generate-questions", "Validator call failed; falling back to local validation", error);
    return normalizedEntries.map((entry) => entry.question);
  }
}

async function persistQuestions(
  subItemId: string,
  resolvedDifficulty: number,
  questions: GeneratedQuestion[]
): Promise<SavedQuestion[]> {
  const persisted = await Promise.all(
    questions.map((question) =>
      prisma.question.create({
        data: {
          subItemId,
          type: question.type,
          content: question.content,
          options: question.options ? JSON.stringify(question.options) : null,
          answer: question.answer,
          explanation: question.explanation,
          primer: question.primer ?? null,
          fact: question.fact ?? null,
          difficulty: resolvedDifficulty,
          timeLimit: question.timeLimit ?? null,
        },
      })
    )
  );

  return persisted.map((savedQuestion, index) => ({
    id: savedQuestion.id,
    subItemId: savedQuestion.subItemId,
    difficulty: savedQuestion.difficulty,
    createdAt: savedQuestion.createdAt,
    ...questions[index],
  }));
}

async function generateAndSaveQuestions(
  userId: string,
  subItemId: string,
  subItem: SubItemWithContext,
  resolvedDifficulty: number,
  correctRate: number,
  count: number,
  sourceContext: BookSourceContext | null = null
): Promise<SavedQuestion[]> {
  if (!hasGenerationApiKey()) {
    throw new QuestionGenerationConfigError();
  }

  let teachingProfile: TeachingProfile | null = null;
  if (subItem.item.topic.teachingProfile) {
    try {
      teachingProfile = JSON.parse(subItem.item.topic.teachingProfile);
    } catch {
      logger.warn("generate-questions", "Failed to parse teachingProfile JSON");
    }
  }

  const difficultyDesc = getDifficultyDescription(resolvedDifficulty);

  const pedagogyBlock = teachingProfile
    ? `
PEDAGOGICAL APPROACH FOR THIS DOMAIN:
- Teaching style: ${teachingProfile.style}
- Register: ${teachingProfile.register}
- Assessment focus: ${teachingProfile.assessmentFocus}
- How to frame questions: ${teachingProfile.contextHint}
- Example domain to draw from: ${teachingProfile.exampleDomain}
- Question pattern templates (adapt freely):
${teachingProfile.questionPatterns.map((pattern) => `  • ${pattern}`).join("\n")}

Apply this pedagogical approach when writing all questions. The questions should feel native to this domain.`
    : "";

  if (teachingProfile) {
    logger.debug("generate-questions", `Using teaching profile: ${teachingProfile.style} / ${teachingProfile.assessmentFocus}`);
  }

  const timeLimitByDifficulty: Record<number, number> = { 1: 210, 2: 180, 3: 150, 4: 120, 5: 120 };
  const defaultTimeLimit = timeLimitByDifficulty[resolvedDifficulty] ?? 150;
  const timerInstruction = resolvedDifficulty === 0
    ? `- "timeLimit": use null for all questions (preflight/orientation level — no time pressure)`
    : `- "timeLimit": use ${defaultTimeLimit} for multiple_choice, true_false, and single_choice. Use null for fill_blank.`;

  const prompt = buildGenerationPrompt(
    subItem,
    resolvedDifficulty,
    correctRate,
    count,
    pedagogyBlock,
    difficultyDesc,
    timerInstruction,
    sourceContext
  );

  const acceptedQuestions: GeneratedQuestion[] = [];
  const seenQuestions = new Set<string>();

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && acceptedQuestions.length < count; attempt++) {
    const requestedCount = count - acceptedQuestions.length;
    const candidateBatch = await requestQuestionBatch(prompt, userId, resolvedDifficulty);
    // Preflight questions are trivially simple (true/false, obvious options) — skip LLM validation
    const validatedBatch = resolvedDifficulty === 0
      ? candidateBatch.map(normalizeQuestion).filter((q): q is GeneratedQuestion => q !== null)
      : await validateGeneratedQuestions(candidateBatch, userId);

    for (const question of validatedBatch) {
      const dedupeKey = `${question.type}:${question.content.toLowerCase()}`;
      if (seenQuestions.has(dedupeKey)) {
        continue;
      }

      seenQuestions.add(dedupeKey);
      acceptedQuestions.push(question);

      if (acceptedQuestions.length >= count) {
        break;
      }
    }

    logger.debug("generate-questions", "Validation pass completed", {
      requestedCount,
      accepted: acceptedQuestions.length,
      attempt: attempt + 1,
    });
  }

  if (acceptedQuestions.length === 0) {
    throw new Error("Could not generate any internally consistent questions");
  }

  const persistedQuestions = await persistQuestions(
    subItemId,
    resolvedDifficulty,
    acceptedQuestions.slice(0, count)
  );

  logger.info("generate-questions", `Saved ${persistedQuestions.length} validated questions to DB`, {
    subItemId,
  });

  return persistedQuestions;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    // Verify user still exists in DB (stale cookie guard)
    const userExists = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true },
    });
    if (!userExists) {
      const res = NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      res.cookies.delete("dystoppia_uid");
      return res;
    }

    const { subItemId, difficulty, count = 3, stats, prefetch = false } = await req.json();

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
    let sourceContext: BookSourceContext | null = null;

    try {
      sourceContext = await getSourceContextForSubItem(auth.userId, subItemId);
    } catch (error) {
      if (error instanceof SourceContextAccessError) {
        return NextResponse.json({ error: "SubItem not found" }, { status: 404 });
      }
      throw error;
    }

    // Prefetch mode: warmup shared cache without charging user quota.
    // Abuse guard is the cache-depth check below — if we already have PREFETCH_CACHE_TARGET
    // questions, no LLM call is made, so runaway spend is bounded by distinct subItems.
    if (!prefetch) {
      try {
        await checkRateLimit(auth.userId, count, "question");
      } catch (error) {
        if (error instanceof RateLimitError) {
          return NextResponse.json(
            {
              error: "rate_limited",
              window: error.window,
              remaining: error.remaining,
              resetsAt: error.resetsAt,
              upgradeUrl: "/pricing",
            },
            { status: 429 }
          );
        }
        throw error;
      }
    }

    const existingQuestions = await prisma.question.findMany({
      where: {
        subItemId,
        difficulty: resolvedDifficulty,
        flaggedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const validQuestions = existingQuestions.filter(
      (question) => question.type !== "fill_blank" || (question.options && question.options !== "[]" && question.options !== "null")
    );

    logger.info("generate-questions", `SubItem "${subItem.name}" — found ${validQuestions.length} cached, need ${count}`, {
      subItemId,
      difficulty: resolvedDifficulty,
      prefetch,
    });

    // Prefetch path: warm up the cache in the background and return 202 immediately.
    // Does not block on generation and does not return questions (client discards).
    if (prefetch) {
      if (validQuestions.length < PREFETCH_CACHE_TARGET) {
        const needed = Math.min(REFILL_BATCH, PREFETCH_CACHE_TARGET - validQuestions.length);
        logger.debug(
          "generate-questions",
          `Prefetch warmup — generating ${needed} in background (cached=${validQuestions.length})`
        );
        generateAndSaveQuestions(
          auth.userId,
          subItemId,
          subItem,
          resolvedDifficulty,
          correctRate,
          needed,
          sourceContext
        ).catch((error) =>
          logger.warn("generate-questions", "Prefetch warmup failed", error)
        );
      }
      return NextResponse.json({ prefetched: true, cached: validQuestions.length }, { status: 202 });
    }

    if (validQuestions.length >= count) {
      logger.debug("generate-questions", `Cache hit — returning ${count} from DB (${validQuestions.length} cached)`);

      const shuffled = validQuestions.sort(() => Math.random() - 0.5).slice(0, count);

      if (validQuestions.length < REFILL_THRESHOLD) {
        logger.debug("generate-questions", `Cache low (${validQuestions.length}), refilling ${REFILL_BATCH} in background`);
        generateAndSaveQuestions(auth.userId, subItemId, subItem, resolvedDifficulty, correctRate, REFILL_BATCH, sourceContext).catch((error) =>
          logger.warn("generate-questions", "Background refill failed", error)
        );
      }

      return NextResponse.json({
        questions: shuffled.map((question) => {
          const options = question.options ? JSON.parse(question.options) : null;
          return { ...question, options: shuffleOptions(options, question.type), fact: (question as { fact?: string | null }).fact ?? null };
        }),
      });
    }

    if (validQuestions.length > 0) {
      logger.debug("generate-questions", `Partial cache (${validQuestions.length}) — returning now, generating ${REFILL_BATCH} in background`);

      generateAndSaveQuestions(auth.userId, subItemId, subItem, resolvedDifficulty, correctRate, REFILL_BATCH, sourceContext).catch((error) =>
        logger.warn("generate-questions", "Background refill failed", error)
      );

      return NextResponse.json({
        questions: validQuestions.map((question) => {
          const options = question.options ? JSON.parse(question.options) : null;
          return { ...question, options: shuffleOptions(options, question.type), fact: (question as { fact?: string | null }).fact ?? null };
        }),
      });
    }

    logger.info("generate-questions", `Cache empty — generating ${count} questions synchronously`);
    const generated = await generateAndSaveQuestions(
      auth.userId,
      subItemId,
      subItem,
      resolvedDifficulty,
      correctRate,
      count,
      sourceContext
    );

    generateAndSaveQuestions(auth.userId, subItemId, subItem, resolvedDifficulty, correctRate, REFILL_BATCH, sourceContext).catch((error) =>
      logger.warn("generate-questions", "Post-generation background warmup failed", error)
    );

    return NextResponse.json({
      questions: generated.map((question) => ({
        id: question.id,
        type: question.type,
        content: question.content,
        options: shuffleOptions(question.options ?? null, question.type),
        answer: question.answer,
        explanation: question.explanation,
        primer: question.primer ?? null,
        fact: question.fact ?? null,
        timeLimit: question.timeLimit ?? null,
        subItemId,
        difficulty: resolvedDifficulty,
        createdAt: question.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof QuestionGenerationConfigError) {
      logger.error("generate-questions", "ANTHROPIC_API_KEY is not configured");
      return NextResponse.json(
        {
          error: "question_generation_not_configured",
          message: process.env.NODE_ENV === "production"
            ? "Question generation is temporarily unavailable."
            : "Question generation is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
        },
        { status: 503 }
      );
    }

    logger.error("generate-questions", "Failed to generate questions", error);
    return NextResponse.json(
      {
        error: "Failed to generate questions",
        ...(process.env.NODE_ENV === "development" ? { details: String(error) } : {}),
      },
      { status: 500 }
    );
  }
}
