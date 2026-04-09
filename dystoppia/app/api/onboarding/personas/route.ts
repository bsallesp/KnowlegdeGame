import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/authGuard";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { prompt } = (await req.json()) as { prompt: string };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const systemPrompt = `You are a system that analyzes a user's business/product request and identifies the professional personas (skills) needed to properly evaluate, debate, and deliver that request.

You must be REALISTIC. Not pessimistic, not optimistic. Identify exactly the skills that are truly necessary.

For each persona, provide:
- id: a short snake_case identifier
- name: the professional title (e.g. "Software Architect", "Healthcare Compliance Specialist")
- emoji: a single emoji that represents this persona
- reason: a one-sentence explanation of why this persona is needed for THIS specific request
- initialThought: what this persona's first professional reaction/concern/insight would be about the request (2-3 sentences, in first person, realistic tone)

ALWAYS include a "customer_success" persona — this is the one who interfaces with the user, asks clarifying questions, and translates between the technical team and the user.

Return ONLY valid JSON in this exact format:
{
  "personas": [...],
  "projectSummary": "one paragraph summarizing what the user seems to want",
  "clarifyingQuestions": ["question 1", "question 2", ...],
  "initialDebate": [
    {
      "personaId": "...",
      "message": "...",
      "replyTo": null or "persona_id they are responding to"
    }
  ]
}

The initialDebate should be a realistic back-and-forth between 3-5 personas discussing the request, surfacing concerns, opportunities, risks, and unknowns. Each message should be 2-4 sentences. Include at least 6 messages in the debate. The debate should end with the customer_success persona summarizing what needs to be clarified with the user.

The clarifyingQuestions should be the top 3-5 questions the team needs answered before they can proceed. These questions come from the debate — they are the unknowns the team identified.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `User request: "${prompt.trim()}"`,
        },
      ],
      system: systemPrompt,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const result = JSON.parse(jsonStr);

    return NextResponse.json(result);
  } catch (err) {
    console.error("Persona detection failed:", err);
    return NextResponse.json(
      { error: "Failed to analyze request" },
      { status: 500 }
    );
  }
}
