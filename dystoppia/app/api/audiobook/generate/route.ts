import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireUser } from "@/lib/authGuard";
import { getTTSProvider } from "@/lib/tts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface SubItemStat {
  correctCount: number;
  totalCount: number;
  difficulty: number;
}

interface AudiobookRequest {
  topicId: string;
  /** Scope: if provided, audio focuses only on this item's subitems */
  itemId?: string;
  /** Scope: if provided, audio focuses only on this specific subitem */
  subItemId?: string;
  subItemStats: Record<string, SubItemStat>;
}

type SubItemWithParent = {
  id: string;
  name: string;
  itemName: string;
};

function classifySubItems(
  subItems: SubItemWithParent[],
  subItemStats: Record<string, SubItemStat>
) {
  const weakSpots: { name: string; rate: number }[] = [];
  const mastered: { name: string }[] = [];
  const upcoming: { name: string }[] = [];

  for (const sub of subItems) {
    const stats = subItemStats[sub.id];
    if (!stats || stats.totalCount === 0) {
      upcoming.push({ name: sub.name });
      continue;
    }
    const rate = stats.correctCount / stats.totalCount;
    if (stats.totalCount >= 3 && rate < 0.5) {
      weakSpots.push({ name: sub.name, rate });
    } else if (stats.totalCount >= 10 && rate >= 0.8) {
      mastered.push({ name: sub.name });
    }
  }

  return { weakSpots, mastered, upcoming };
}

function buildPrompt(
  topicName: string,
  scopeLabel: string,
  scopeDescription: string,
  weakSpots: { name: string; rate: number }[],
  mastered: { name: string }[],
  upcoming: { name: string }[]
): string {
  const weakSection =
    weakSpots.length > 0
      ? `Struggling with: ${weakSpots.map((w) => `"${w.name}" (${Math.round(w.rate * 100)}% correct)`).join(", ")}.`
      : "No significant weak spots yet in this scope.";

  const masteredSection =
    mastered.length > 0
      ? `Mastered: ${mastered.map((m) => `"${m.name}"`).join(", ")}.`
      : "Nothing fully mastered yet here.";

  const upcomingSection =
    upcoming.length > 0
      ? `Not yet attempted: ${upcoming.map((u) => `"${u.name}"`).join(", ")}.`
      : "";

  return `You are a warm, encouraging learning narrator for Dystoppia, an adaptive learning app.

Topic: "${topicName}"
Focused scope: ${scopeLabel} — ${scopeDescription}

LEARNER PERFORMANCE IN THIS SCOPE:
${weakSection}
${masteredSection}
${upcomingSection}

Write a personalized 2–3 minute audio narration (approximately 350–450 words) that:
1. Opens by naming the specific scope (chapter or concept) the learner asked about
2. Reinforces the weak spots with clear, concise explanations (main focus)
3. Briefly celebrates any mastered concepts
4. Previews what's next in this scope
5. Closes with an encouraging call to action

Tone: mentor-like, warm, direct — like a brilliant tutor speaking naturally.
Style: conversational spoken word. No bullet points, no markdown, no stage directions.
Write ONLY the narration text that will be read aloud.`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const body: AudiobookRequest = await req.json();
    const { topicId, itemId, subItemId, subItemStats } = body;

    if (!topicId) {
      return NextResponse.json({ error: "topicId is required" }, { status: 400 });
    }

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { items: { include: { subItems: true } } },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Determine scope
    let scopedSubItems: SubItemWithParent[];
    let scopeLabel: string;
    let scopeDescription: string;

    if (subItemId) {
      // Single concept
      const found = topic.items
        .flatMap((it) => it.subItems.map((s) => ({ ...s, itemName: it.name })))
        .find((s) => s.id === subItemId);

      if (!found) return NextResponse.json({ error: "SubItem not found" }, { status: 404 });

      scopedSubItems = [found];
      scopeLabel = `Concept`;
      scopeDescription = `"${found.name}" (from chapter "${found.itemName}")`;
    } else if (itemId) {
      // Full chapter (all subitems of that item)
      const item = topic.items.find((it) => it.id === itemId);
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

      scopedSubItems = item.subItems.map((s) => ({ ...s, itemName: item.name }));
      scopeLabel = `Chapter`;
      scopeDescription = `"${item.name}"`;
    } else {
      // Full topic fallback
      scopedSubItems = topic.items.flatMap((it) =>
        it.subItems.map((s) => ({ ...s, itemName: it.name }))
      );
      scopeLabel = `Topic`;
      scopeDescription = `"${topic.name}"`;
    }

    const { weakSpots, mastered, upcoming } = classifySubItems(scopedSubItems, subItemStats);

    logger.info("audiobook", `Generating for scope: ${scopeLabel} ${scopeDescription}`, {
      weakSpots: weakSpots.length,
      mastered: mastered.length,
      upcoming: upcoming.length,
    });

    const prompt = buildPrompt(topic.name, scopeLabel, scopeDescription, weakSpots, mastered, upcoming);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type from Claude");
    const script = content.text.trim();

    logger.info("audiobook", `Script generated (${script.length} chars), calling TTS`);

    const tts = getTTSProvider();
    const audioBuffer = await tts.synthesize(script, { voice: "nova", speed: 1.0 });

    logger.info("audiobook", `Audio synthesized (${audioBuffer.length} bytes)`);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.length),
      },
    });
  } catch (error) {
    logger.error("audiobook", "Failed to generate audiobook", error);
    return NextResponse.json(
      { error: "Failed to generate audiobook", details: String(error) },
      { status: 500 }
    );
  }
}
