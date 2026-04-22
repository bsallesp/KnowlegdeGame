import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { requireUser } from "@/lib/authGuard";
import { checkRateLimit, RateLimitError } from "@/lib/rateLimit";
import { logLLMUsage } from "@/lib/llmLogger";
import { requireAnthropicKey } from "@/lib/anthropicGuard";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const encoder = new TextEncoder();

function sseEvent(data: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const keyGuard = requireAnthropicKey("generate-structure");
  if (keyGuard) return keyGuard;

  const { topic, onboardingContext } = await req.json() as { topic: string; onboardingContext?: string };

  if (!topic || typeof topic !== "string") {
    return new Response(JSON.stringify({ error: "Topic is required" }), { status: 400 });
  }

  const slug = slugify(topic);
  logger.info("generate-structure", `Request for topic "${topic}"`, { slug });

  // Check if topic already exists
  const existing = await prisma.topic.findUnique({
    where: { slug },
    include: {
      items: {
        include: { subItems: true },
        orderBy: { order: "asc" },
      },
    },
  });

  // Cache hit: stream existing items as SSE events
  if (existing) {
    logger.info("generate-structure", `Cache hit — streaming existing topic`, { id: existing.id });
    const fullTopic = {
      ...existing,
      teachingProfile: existing.teachingProfile ? JSON.parse(existing.teachingProfile) : null,
    };

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sseEvent({ type: "profile", data: fullTopic.teachingProfile }));
        for (const item of fullTopic.items) {
          controller.enqueue(sseEvent({ type: "item", data: item }));
        }
        controller.enqueue(sseEvent({ type: "done", data: fullTopic }));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  logger.info("generate-structure", `No cache — streaming LLM for "${topic}"`);

  // Cache miss: costs 1 curriculum call
  try {
    await checkRateLimit(auth.userId, 1, "curriculum");
  } catch (e) {
    if (e instanceof RateLimitError) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          window: e.window,
          remaining: e.remaining,
          resetsAt: e.resetsAt,
          upgradeUrl: "/pricing",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    throw e;
  }

  const userContextSection = onboardingContext
    ? `\nUser Learning Context (use this to deeply personalize the teaching profile and item selection):\n${onboardingContext}\n`
    : "";

  const prompt = `You are a curriculum designer and pedagogy expert. Given a topic, generate a structured learning outline with a teaching profile.

All output (item names, subItem names, and all teaching profile text fields) must be written in English.


Topic: "${topic}"
${userContextSection}
Analyze the domain deeply. Consider:
- Is this a certification/exam topic? (scenario-based, problem-solving)
- Is it a practical/craft skill? (procedural, hands-on)
- Is it an academic subject? (conceptual, analytical)
- Is it a professional skill? (applied, case-based)
- Is it creative? (exploratory, example-driven)

Output ONLY valid NDJSON — one JSON object per line. No markdown, no code blocks, no explanation.

Line 1 — teaching profile (exactly this format):
{"type":"profile","data":{"style":"one of: scenario_based|practical_procedural|conceptual_narrative|analytical_comparative|creative_exploratory|definition_recall","register":"one of: technical_professional|instructional_practical|academic_formal|conversational_informal","questionPatterns":["2-4 sentence starter templates for this domain"],"contextHint":"1-2 sentences on framing questions for max pedagogical value","exampleDomain":"concrete real-world setting","assessmentFocus":"one of: recall|comprehension|application|analysis|synthesis|evaluation"}}

Then 3-6 lines, one per item (exactly this format):
{"type":"item","data":{"name":"Item Name","subItems":[{"name":"SubItem Name"},{"name":"SubItem Name"}]}}

Rules:
- 3-6 items total
- 2-5 subItems each
- Names concise (2-6 words)
- teachingProfile must reflect the actual domain, not be generic
- Each object on its own line, no trailing commas, no extra whitespace`;

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let teachingProfile: Record<string, unknown> | null = null;
      const items: Array<{ name: string; subItems: Array<{ name: string }> }> = [];

      try {
        const llmStream = client.messages.stream({
          model: "claude-opus-4-5",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        });

        llmStream.on("message", (msg) => {
          logLLMUsage({
            userId: auth.userId,
            model: "claude-opus-4-5",
            endpoint: "generate-structure",
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
          });
        });

        for await (const chunk of llmStream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            buffer += chunk.delta.text;

            // Parse complete NDJSON lines as they arrive
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.type === "profile") {
                  teachingProfile = parsed.data;
                } else if (parsed.type === "item") {
                  items.push(parsed.data);
                }
                controller.enqueue(sseEvent(parsed));
              } catch {
                // Incomplete or invalid JSON line — skip
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim());
            if (parsed.type === "profile") teachingProfile = parsed.data;
            else if (parsed.type === "item") items.push(parsed.data);
            controller.enqueue(sseEvent(parsed));
          } catch {}
        }

        // Save to database
        const newTopic = await prisma.topic.create({
          data: {
            name: topic,
            slug,
            teachingProfile: teachingProfile ? JSON.stringify(teachingProfile) : null,
            items: {
              create: items.map((item, itemIndex) => ({
                name: item.name,
                order: itemIndex,
                subItems: {
                  create: item.subItems.map((sub, subIndex) => ({
                    name: sub.name,
                    order: subIndex,
                    difficulty: 1,
                  })),
                },
              })),
            },
          },
          include: {
            items: {
              include: { subItems: true },
              orderBy: { order: "asc" },
            },
          },
        });

        logger.info("generate-structure", `Topic created`, { id: newTopic.id, items: newTopic.items.length });
        controller.enqueue(sseEvent({ type: "done", data: { ...newTopic, teachingProfile } }));
        controller.close();
      } catch (error) {
        logger.error("generate-structure", "Streaming failed", error);
        controller.enqueue(sseEvent({ type: "error", message: String(error) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
