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
      ? `WEAK (needs reinforcement): ${weakSpots.map((w) => `"${w.name}" (${Math.round(w.rate * 100)}% correct)`).join(", ")}`
      : "No weak spots yet.";

  const masteredSection =
    mastered.length > 0
      ? `MASTERED: ${mastered.map((m) => `"${m.name}"`).join(", ")}`
      : "";

  const upcomingSection =
    upcoming.length > 0
      ? `NOT SEEN YET: ${upcoming.map((u) => `"${u.name}"`).join(", ")}`
      : "";

  return `You are a brutally efficient tutor creating an audio lesson for someone with ADHD.

CONTEXT:
- Topic: "${topicName}"
- Scope: ${scopeLabel} — ${scopeDescription}
- ${weakSection}
- ${masteredSection}
- ${upcomingSection}

RULES (non-negotiable):
0. Write the narration entirely in English.
1. ZERO warm-up. Start with the content immediately. No "Hey there!", no "Welcome back", no "Today we're going to...".
2. MAX 200 words total. Every word must earn its place.
3. Cover ONLY the weak spots. Ignore mastered content.
4. One concept = one sentence. Short. Punchy. No compound sentences.
5. Use concrete examples, never abstract definitions.
6. No filler words: "basically", "essentially", "in other words", "remember that", "it's important to".
7. End with ONE actionable next step. Nothing else.

FORMAT: Plain spoken sentences. No lists read aloud. No "first... second... third".
Write ONLY the narration. Nothing else.`;
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

    type TopicItem = (typeof topic.items)[number];
    type SubItem = TopicItem["subItems"][number];

    if (subItemId) {
      // Single concept
      const flatItems: SubItemWithParent[] = topic.items.flatMap((it: TopicItem) =>
        it.subItems.map((s: SubItem) => ({ id: s.id, name: s.name, itemName: it.name }))
      );
      const found = flatItems.find((s: SubItemWithParent) => s.id === subItemId);

      if (!found) return NextResponse.json({ error: "SubItem not found" }, { status: 404 });

      scopedSubItems = [found];
      scopeLabel = `Concept`;
      scopeDescription = `"${found.name}" (from chapter "${found.itemName}")`;
    } else if (itemId) {
      // Full chapter (all subitems of that item)
      const item = topic.items.find((it: TopicItem) => it.id === itemId);
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

      scopedSubItems = item.subItems.map((s: SubItem) => ({ id: s.id, name: s.name, itemName: item.name }));
      scopeLabel = `Chapter`;
      scopeDescription = `"${item.name}"`;
    } else {
      // Full topic fallback
      scopedSubItems = topic.items.flatMap((it: TopicItem) =>
        it.subItems.map((s: SubItem) => ({ id: s.id, name: s.name, itemName: it.name }))
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
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type from Claude");
    const script = content.text.trim();

    logger.info("audiobook", `Script generated (${script.length} chars), calling TTS`);

    const tts = getTTSProvider();
    const audioBuffer = await tts.synthesize(script, { voice: "nova", speed: 1.0 });

    logger.info("audiobook", `Audio synthesized (${audioBuffer.length} bytes)`);

    // `Buffer.buffer` includes the full underlying ArrayBuffer (may include unrelated bytes).
    // Slice using byteOffset/byteLength so the response body matches the synthesized audio.
    const audioBytes = audioBuffer instanceof Uint8Array ? audioBuffer : new Uint8Array(audioBuffer as any);
    const arrayBuffer = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    );

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBytes.byteLength),
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
