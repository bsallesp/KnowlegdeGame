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

interface QAHistoryItem {
  question: string;
  answer: string;
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
          id: `follow_up_${index + 1}`,
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
            : `follow_up_${index + 1}`,
        question,
        suggestions: suggestions.length > 0 ? suggestions : fallbackSuggestions,
      };
    })
    .filter((q): q is ClarifyingQuestion => q !== null);
}

function normalizeQaHistory(input: unknown): QAHistoryItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { question?: unknown; answer?: unknown };
      const question =
        typeof raw.question === "string" ? raw.question.trim() : "";
      const answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((entry): entry is QAHistoryItem => entry !== null);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    originalPrompt: string;
    personas: Array<{ id: string; name: string; emoji: string; reason: string }>;
    qaHistory?: QAHistoryItem[];
    clarifyingQuestions?: Array<string | { question?: string }>;
    userAnswers?: string;
    projectSummary: string;
    iteration?: number;
    existingMvpProposal?: unknown;
    allowAssumptions?: boolean;
  };

  if (!body.originalPrompt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const normalizedQaHistory = normalizeQaHistory(body.qaHistory);
  const legacyQuestions = Array.isArray(body.clarifyingQuestions)
    ? body.clarifyingQuestions
        .map((q) =>
          typeof q === "string"
            ? q.trim()
            : typeof q?.question === "string"
              ? q.question.trim()
              : ""
        )
        .filter(Boolean)
    : [];
  const iteration =
    typeof body.iteration === "number" && body.iteration > 0
      ? Math.floor(body.iteration)
      : 1;
  const allowAssumptions = body.allowAssumptions === true;

  const qaHistoryText =
    normalizedQaHistory.length > 0
      ? normalizedQaHistory
          .map(
            (item, i) =>
              `${i + 1}. Question: ${item.question}\nAnswer: ${item.answer}`
          )
          .join("\n\n")
      : body.userAnswers?.trim() || "";

  const existingProposalText =
    body.existingMvpProposal && typeof body.existingMvpProposal === "object"
      ? JSON.stringify(body.existingMvpProposal, null, 2)
      : "";

  if (!qaHistoryText) {
    return NextResponse.json(
      { error: "At least one answered question is required" },
      { status: 400 }
    );
  }

  const systemPrompt = `You are a team of professional personas working together to produce an MVP specification for a user's project. You are REALISTIC — not pessimistic, not optimistic.

The team previously analyzed the user's request, debated, and asked clarifying questions. The user has now provided answers.

Current alignment round: ${iteration}

Your job is to:

1. Have the personas discuss the user's answers briefly (refinedDebate)
2. Decide if the team is ready to present an MVP with cost and schedule estimates
3. If NOT ready, ask only the minimum extra questions needed to close the gaps
4. If ready, produce the MVP proposal with explicit cost and estimate details

## Team members
${body.personas.map((p) => `- ${p.emoji} ${p.name} (${p.id}): ${p.reason}`).join("\n")}

## Original request
"${body.originalPrompt}"

## Project summary from initial analysis
${body.projectSummary}

## Questions asked so far
${legacyQuestions.length > 0 ? legacyQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") : "(not provided separately)"}

## User's answers
${qaHistoryText}

## Existing MVP proposal (if any)
${existingProposalText || "none"}

Return ONLY valid JSON in this exact format:
{
  "refinedDebate": [
    {
      "personaId": "...",
      "message": "2-3 sentences reacting to the user's answers, in first person",
      "replyTo": null or "persona_id"
    }
  ],
  "readiness": {
    "readyForMvp": true or false,
    "reason": "one paragraph explaining why ready or not",
    "missingInfo": ["missing item 1", "missing item 2", ...]
  },
  "nextQuestions": [
    {
      "id": "short_snake_case_id",
      "question": "single concrete follow-up question",
      "suggestions": ["option 1", "option 2", "option 3"]
    }
  ],
  "mvpProposal": null OR {
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
    "estimatedBuildCostUSD": "cost range to build MVP in USD (e.g. $25k-$45k)",
    "estimatedMonthlyCostUSD": "monthly operating cost range in USD (e.g. $800-$2,000/month)",
    "estimateAssumptions": ["assumption 1", "assumption 2"],
    "businessModel": "how the product could make money or deliver value",
    "legalConsiderations": ["consideration 1", "consideration 2"],
    "teamRecommendation": "what kind of team is needed to build this"
  },
  "nextActions": ["actionable next step 1", "actionable next step 2", ...]
}

Rules:
- The refinedDebate should have 4-6 messages.
- If readiness.readyForMvp is false, mvpProposal must be null and nextQuestions must contain 2-4 targeted follow-up questions.
- If readiness.readyForMvp is true, nextQuestions must be [] and mvpProposal must be fully populated with cost and estimate fields.
- If an existing MVP proposal is provided, treat this as a revision cycle: keep what still works, adjust what the user's remarks challenge, and explain tradeoffs.
- If allowAssumptions is true (${allowAssumptions}), you may proceed with a best-effort MVP using explicit assumptions instead of blocking for more questions.
- Be specific, concrete, and realistic. No fluff.`;

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

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const readinessRaw =
      parsed.readiness && typeof parsed.readiness === "object"
        ? (parsed.readiness as {
            readyForMvp?: unknown;
            reason?: unknown;
            missingInfo?: unknown;
          })
        : null;

    const result = {
      refinedDebate: Array.isArray(parsed.refinedDebate)
        ? parsed.refinedDebate
        : [],
      readiness: {
        readyForMvp: readinessRaw?.readyForMvp === true,
        reason:
          typeof readinessRaw?.reason === "string"
            ? readinessRaw.reason
            : "",
        missingInfo: Array.isArray(readinessRaw?.missingInfo)
          ? readinessRaw.missingInfo
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
      },
      nextQuestions: normalizeClarifyingQuestions(parsed.nextQuestions),
      mvpProposal:
        parsed.mvpProposal && typeof parsed.mvpProposal === "object"
          ? parsed.mvpProposal
          : null,
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Refinement failed:", err);
    return NextResponse.json({ error: "Failed to refine proposal" }, { status: 500 });
  }
}
