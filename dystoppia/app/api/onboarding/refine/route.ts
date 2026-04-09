import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/authGuard";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    originalPrompt: string;
    personas: Array<{ id: string; name: string; emoji: string; reason: string }>;
    clarifyingQuestions: string[];
    userAnswers: string;
    projectSummary: string;
  };

  if (!body.originalPrompt || !body.userAnswers?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const systemPrompt = `You are a team of professional personas working together to produce an MVP specification for a user's project. You are REALISTIC — not pessimistic, not optimistic.

The team previously analyzed the user's request, debated, and asked clarifying questions. The user has now provided answers. Your job is to:

1. Have the personas discuss the user's answers briefly (refinedDebate)
2. Converge on a realistic MVP proposal

## Team members
${body.personas.map((p) => `- ${p.emoji} ${p.name} (${p.id}): ${p.reason}`).join("\n")}

## Original request
"${body.originalPrompt}"

## Project summary from initial analysis
${body.projectSummary}

## Questions asked
${body.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## User's answers
${body.userAnswers}

Return ONLY valid JSON in this exact format:
{
  "refinedDebate": [
    {
      "personaId": "...",
      "message": "2-3 sentences reacting to the user's answers, in first person",
      "replyTo": null or "persona_id"
    }
  ],
  "mvpProposal": {
    "productName": "suggested name for the product",
    "oneLiner": "one sentence describing what the MVP does",
    "coreFeatures": [
      {
        "name": "Feature name",
        "description": "What it does",
        "priority": "must-have" | "should-have" | "nice-to-have",
        "complexity": "low" | "medium" | "high"
      }
    ],
    "architecture": {
      "summary": "2-3 sentences about the technical architecture",
      "stack": ["technology 1", "technology 2", ...],
      "services": [
        { "name": "Service name", "purpose": "what it does" }
      ]
    },
    "risks": [
      { "risk": "description", "mitigation": "how to handle it", "severity": "low" | "medium" | "high" }
    ],
    "phases": [
      {
        "name": "Phase name",
        "duration": "estimated time",
        "deliverables": ["deliverable 1", "deliverable 2"]
      }
    ],
    "outOfScope": ["thing 1", "thing 2"],
    "estimatedEffort": "rough estimate in weeks/months",
    "businessModel": "how the product could make money or deliver value",
    "legalConsiderations": ["consideration 1", "consideration 2"],
    "teamRecommendation": "what kind of team is needed to build this"
  },
  "nextActions": ["actionable next step 1", "actionable next step 2", ...]
}

The refinedDebate should have 4-6 messages. The personas should react to the answers, adjust their positions, and converge toward the MVP proposal. Be specific, concrete, and realistic in the proposal. No fluff.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      messages: [{ role: "user", content: "Generate the refined debate and MVP proposal based on the context provided." }],
      system: systemPrompt,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1];

    const result = JSON.parse(jsonStr);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Refinement failed:", err);
    return NextResponse.json({ error: "Failed to refine proposal" }, { status: 500 });
  }
}
