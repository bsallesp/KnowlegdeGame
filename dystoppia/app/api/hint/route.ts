import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { questionContent, options, answer, subItemName, topicName } = await req.json();

    if (!questionContent) {
      return NextResponse.json({ error: "questionContent is required" }, { status: 400 });
    }

    const prompt = `You are a helpful tutor. A student is stuck on this quiz question and needs a hint — but NOT the answer.

Topic: "${topicName}"
Concept: "${subItemName}"
Question: "${questionContent}"
Options: ${options ? JSON.stringify(options) : "open answer"}

Give a short, helpful hint (1-2 sentences) that guides the student toward the answer without revealing it directly.
Do NOT mention the correct answer (${answer}). Be encouraging and specific to the concept.
Reply in English only. Reply with ONLY the hint text, no preamble.`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    logger.debug("hint", `Generated hint for question in "${subItemName}"`);
    return NextResponse.json({ hint: content.text.trim() });
  } catch (error) {
    logger.error("hint", "Failed to generate hint", error);
    return NextResponse.json({ error: "Failed to generate hint" }, { status: 500 });
  }
}
