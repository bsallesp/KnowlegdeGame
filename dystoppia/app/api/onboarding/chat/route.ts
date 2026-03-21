import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import type { OnboardingMessage, OnboardingEntry } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { topic, messages, pillar } = await req.json() as {
    topic: string;
    messages: OnboardingMessage[];
    pillar: string;
  };

  if (!topic) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  // Fetch existing user profile to avoid redundant questions
  const profile = await prisma.userProfile.findUnique({
    where: { userId: auth.userId },
  });

  const profileData = profile
    ? {
        goals: profile.goals ? JSON.parse(profile.goals) : [],
        knowledgeLevels: profile.knowledgeLevels ? JSON.parse(profile.knowledgeLevels) : {},
        timePerSession: profile.timePerSession,
        preferredLang: profile.preferredLang,
      }
    : null;

  const prompt = buildPrompt(topic, messages, profileData, pillar ?? "studio");

  let text = "";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    text = response.content[0].type === "text" ? response.content[0].text : "";
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }

  // Extract JSON from response (strip any accidental markdown fences)
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? text);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  // If ready to create, persist onboarding entry to user profile
  if (parsed.readyToCreate && parsed.onboardingContext) {
    await saveOnboardingEntry(auth.userId, topic, parsed.onboardingContext as string);
  }

  return NextResponse.json(parsed);
}

async function saveOnboardingEntry(userId: string, topic: string, context: string) {
  const entry: OnboardingEntry = { topic, context, createdAt: new Date().toISOString() };

  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  const rawHistory: OnboardingEntry[] = existing?.rawHistory
    ? JSON.parse(existing.rawHistory)
    : [];

  rawHistory.push(entry);
  // Keep last 30 entries
  const trimmed = rawHistory.slice(-30);

  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, rawHistory: JSON.stringify(trimmed) },
    update: { rawHistory: JSON.stringify(trimmed) },
  });
}

function buildPrompt(
  topic: string,
  messages: OnboardingMessage[],
  profile: Record<string, unknown> | null,
  pillar: string
): string {
  const conversationHistory =
    messages.length > 0
      ? messages
          .map(
            (m) =>
              `${m.role}: ${m.content}${m.selectedCards?.length ? ` [cards: ${m.selectedCards.join(", ")}]` : ""}`
          )
          .join("\n")
      : "No history yet — this is the first message.";

  const profileContext = profile
    ? `Existing user profile: ${JSON.stringify(profile)}`
    : "No existing profile for this user.";

  return `You are an intelligent learning advisor in the Dystoppia app. Run a dynamic onboarding flow to personalize the user's learning.

Requested topic: "${topic}"
Pillar: ${pillar}

${profileContext}

Conversation so far:
${conversationHistory}

Your task:
- Ask ONE focused and friendly question at a time
- Generate 3-5 SPECIFIC card options for "${topic}" (not generic)
- After 2-4 turns (or earlier if context is already clear), set readyToCreate=true
- Always respond in the user's same language (detect from free-text replies; default: English)
- Skip questions about things you already know from the profile or conversation
- If answers indicate an advanced level, adapt vocabulary and depth

Information collection priority:
1. Knowledge level/background with "${topic}" and related areas
2. Main objective (certification? work? curiosity? specific use case?)
3. Time available per session
4. (Optional) Preferred learning style

Return ONLY a valid JSON object (no markdown, no explanation, no code blocks):

If you need more information:
{"readyToCreate":false,"turn":{"question":"Clear and friendly question","subtitle":"One line explaining why you are asking","multiSelect":false,"cards":[{"id":"unique_id","label":"Short label","description":"Optional one-line description","icon":"emoji"}],"allowFreeText":true,"freeTextPlaceholder":"Or describe in your own words..."},"summary":{"topic":"${topic}"}}

If you have enough context (after 2+ turns, or if level+goal are already clear):
{"readyToCreate":true,"turn":null,"summary":{"topic":"${topic}"},"onboardingContext":"A complete prose description of the user profile for '${topic}': current level, specific goal, available time, preferred style, and any special focus. This text will directly guide curriculum design and question generation."}`;
}

