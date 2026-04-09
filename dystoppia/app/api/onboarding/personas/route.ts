import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/authGuard";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestions: string[];
}

function normalizeClarifyingQuestions(input: unknown): ClarifyingQuestion[] {
  const fallbackSuggestions = [
    "Ainda estou definindo isso",
    "Quero sua recomendacao",
    "Depende de custo e prazo",
  ];

  if (!Array.isArray(input)) return [];

  return input
    .map((item, index) => {
      if (typeof item === "string") {
        const question = item.trim();
        if (!question) return null;
        return {
          id: `question_${index + 1}`,
          question,
          suggestions: fallbackSuggestions,
        };
      }

      if (!item || typeof item !== "object") return null;
      const raw = item as {
        id?: unknown;
        question?: unknown;
        suggestions?: unknown;
      };

      const question =
        typeof raw.question === "string" ? raw.question.trim() : "";
      if (!question) return null;

      const suggestions = Array.isArray(raw.suggestions)
        ? raw.suggestions
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 4)
        : [];

      return {
        id:
          typeof raw.id === "string" && raw.id.trim()
            ? raw.id.trim()
            : `question_${index + 1}`,
        question,
        suggestions: suggestions.length > 0 ? suggestions : fallbackSuggestions,
      };
    })
    .filter((q): q is ClarifyingQuestion => q !== null);
}

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
  "clarifyingQuestions": [
    {
      "id": "short_snake_case_id",
      "question": "single concrete question",
      "suggestions": ["option 1", "option 2", "option 3"]
    }
  ],
  "initialDebate": [
    {
      "personaId": "...",
      "message": "...",
      "replyTo": null or "persona_id they are responding to"
    }
  ]
}

The initialDebate should be a realistic back-and-forth between 3-5 personas discussing the request, surfacing concerns, opportunities, risks, and unknowns. Each message should be 2-4 sentences. Include at least 6 messages in the debate. The debate should end with the customer_success persona summarizing what needs to be clarified with the user.

The clarifyingQuestions should be the top 3-5 questions the team needs answered before they can proceed. These questions come from the debate — they are the unknowns the team identified.

Each question must include 3-4 short answer suggestions that the user can click quickly. Suggestions must be realistic and concrete for that specific question.`;

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

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const result = {
      ...parsed,
      clarifyingQuestions: normalizeClarifyingQuestions(
        parsed.clarifyingQuestions
      ),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Persona detection failed:", err);
    return NextResponse.json(
      { error: "Failed to analyze request" },
      { status: 500 }
    );
  }
}
