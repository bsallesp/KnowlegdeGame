import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/authGuard";
import { requireAnthropicKey } from "@/lib/anthropicGuard";
import {
  assessDepthForMvp,
  buildDepthGuidance,
  findDepthGaps,
} from "@/lib/mvpDepth";

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

function extractJsonString(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return codeBlockMatch ? codeBlockMatch[1] : text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  return JSON.parse(extractJsonString(text)) as Record<string, unknown>;
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

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function buildGateQuestionsFromGaps(gaps: string[]): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];
  const has = (pattern: RegExp) => gaps.some((gap) => pattern.test(gap));

  if (has(/decisionlog/i)) {
    questions.push({
      id: "decision_log_depth",
      question:
        "Quais decisoes arquiteturais/operacionais obrigatorias devemos registrar com racional, alternativas e impacto?",
      suggestions: [
        "Escolhas de plataforma e servicos cloud",
        "Estrategia de dados e mensageria",
        "Seguranca/compliance e governanca",
        "Confiabilidade (SLO/SLA/DR) e custo",
      ],
    });
  }

  if (has(/estimated(build|monthly)costusd|estimatedeffort|assumptions/i)) {
    questions.push({
      id: "budget_timeline_targets",
      question:
        "Quais metas numericas de custo e prazo devemos assumir para fechar o MVP sem ambiguidade?",
      suggestions: [
        "Faixa de budget de build (USD)",
        "Faixa de custo mensal de operacao (USD)",
        "Prazo alvo com marcos por fase",
        "Quero recomendacao conservadora",
      ],
    });
  }

  if (has(/architecture\.(stack|services)|architecture\.summary|outofscope/i)) {
    questions.push({
      id: "architecture_scope_hardening",
      question:
        "Quais componentes de arquitetura sao obrigatorios e quais ficam explicitamente fora do MVP?",
      suggestions: [
        "Definir stack e servicos cloud minimos",
        "Definir observabilidade e seguranca obrigatorias",
        "Definir limites de escopo da primeira entrega",
        "Definir requisitos de resiliencia/DR",
      ],
    });
  }

  if (has(/automation risk coverage|rate limiting|blocking|tos|legal/i)) {
    questions.push({
      id: "platform_automation_constraints",
      question:
        "Quais limites de automacao de plataforma devemos respeitar para evitar bloqueio e reduzir risco legal?",
      suggestions: [
        "Rate limits e quotas por plataforma",
        "Politica de retry/backoff e contingencia",
        "Vetores de bloqueio (IP/conta/credencial)",
        "ToS/compliance por canal",
      ],
    });
  }

  if (questions.length === 0) {
    questions.push({
      id: "mvp_readiness_gaps",
      question:
        "Quais criterios tecnicos e de negocio faltam para liberar o MVP com seguranca?",
      suggestions: [
        "Arquitetura e operacao",
        "Custos e cronograma",
        "Riscos e compliance",
      ],
    });
  }

  if (questions.length === 1) {
    questions.push({
      id: "mvp_readiness_defaults",
      question:
        "Se houver incerteza, prefere premissas conservadoras ou agressivas para custo/prazo?",
      suggestions: [
        "Conservadoras (menor risco)",
        "Balanceadas",
        "Agressivas (maior velocidade)",
      ],
    });
  }

  return questions.slice(0, 4);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const keyGuard = requireAnthropicKey("onboarding-refine");
  if (keyGuard) return keyGuard;

  const body = (await req.json()) as {
    originalPrompt: string;
    personas: Array<{
      id: string;
      name: string;
      emoji: string;
      reason: string;
      isMandatory?: boolean;
      candidateCatalogType?: "azure_resources" | "developer_stack" | "academic_skills";
      candidateTopChoices?: string[];
      rankingBasis?: string;
      skillDomain?: string;
    }>;
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

  const teamMembersText = body.personas
    .map((persona) => {
      const mandatoryTag = persona.isMandatory ? " [mandatory]" : "";
      const catalogLabel =
        persona.candidateCatalogType === "azure_resources"
          ? "Azure resource candidates"
          : persona.candidateCatalogType === "developer_stack"
            ? "Developer stack candidates"
            : persona.candidateCatalogType === "academic_skills"
              ? "Academic skill candidates"
            : null;
      const topChoices =
        Array.isArray(persona.candidateTopChoices) &&
        persona.candidateTopChoices.length > 0
          ? `\n  Top candidates: ${persona.candidateTopChoices
              .slice(0, 16)
              .join(", ")}`
          : "";
      const skillDomain = persona.skillDomain
        ? `\n  Skill domain: ${persona.skillDomain}`
        : "";
      const rankingBasis = persona.rankingBasis
        ? `\n  Ranking basis: ${persona.rankingBasis}`
        : "";

      return `- ${persona.emoji} ${persona.name} (${persona.id})${mandatoryTag}: ${persona.reason}${
        catalogLabel ? `\n  Catalog: ${catalogLabel}` : ""
      }${skillDomain}${topChoices}${rankingBasis}`;
    })
    .join("\n");

  const depthAssessment = assessDepthForMvp({
    originalPrompt: body.originalPrompt,
    projectSummary: body.projectSummary,
    qaHistoryText,
    personas: body.personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      reason: persona.reason,
    })),
  });
  const depthGuidance = buildDepthGuidance(depthAssessment);

  const systemPrompt = `You are a team of professional personas working together to produce an MVP specification for a user's project. You are REALISTIC — not pessimistic, not optimistic.

The team previously analyzed the user's request, debated, and asked clarifying questions. The user has now provided answers.

Current alignment round: ${iteration}

Your job is to:

1. Have the personas discuss the user's answers briefly (refinedDebate)
2. Decide if the team is ready to present an MVP with cost and schedule estimates
3. If NOT ready, ask only the minimum extra questions needed to close the gaps
4. If ready, produce the MVP proposal with explicit cost and estimate details

## Team members
${teamMembersText}

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

## Required depth policy
${depthGuidance}

## Definition of Ready (hard gate)
To return "readyForMvp": true, the proposal must be operationally buildable now:
- explicit measurable cost/timeline values
- explicit detailed decision log with trade-offs and impacts
- explicit architecture/services scope and boundaries
- explicit platform/legal/risk controls when automation or external platforms are involved

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
    "decisionLog": [
      {
        "title": "short decision title",
        "decision": "what we decided",
        "rationale": "why this is the best choice for this project",
        "alternativesConsidered": ["alternative A", "alternative B"],
        "tradeoffs": "what we gain and what we give up",
        "costImpact": "effect on build/operating cost",
        "timelineImpact": "effect on delivery timeline",
        "riskImpact": "effect on technical/compliance/operational risk"
      }
    ],
    "outOfScope": ["thing 1", "thing 2"],
    "estimatedEffort": "rough estimate in weeks/months",
    "estimatedBuildCostUSD": "AI-assisted build cost range in USD. IMPORTANT: Dystoppia uses AI to generate code, architecture, and infrastructure — this is NOT a human team estimate. AI-assisted build costs are dramatically lower: a micro-SaaS MVP that would cost $80k-$150k with a human team typically costs $500-$5,000 with AI (API credits + review time). Only estimate above $10k if the project requires extensive human-only work (hardware, physical integrations, regulatory certification). Always show both: 'AI-assisted: $X-$Y' and 'Traditional team (for reference): $X-$Y'.",
    "estimatedMonthlyCostUSD": "monthly OPERATING cost range in USD, broken into two tiers: 'Launch (0-100 users): $X-$Y/month' and 'Scale (1k+ users): $X-$Y/month'. A micro-SaaS with no audience should cost $20-$200/month at launch (managed DB, single instance, object storage). Only estimate $1,000+/month when the architecture genuinely requires expensive compute, GPUs, or high-throughput infrastructure at scale.",
    "estimateAssumptions": ["assumption 1", "assumption 2 — MUST include assumed user count, traffic volume, and data size that justify the cost estimate"],
    "businessModel": "how the product could make money or deliver value",
    "legalConsiderations": ["consideration 1", "consideration 2"],
    "teamRecommendation": "what kind of team is needed to build this"
  },
  "nextActions": ["actionable next step 1", "actionable next step 2", ...]
}

Rules:
- The refinedDebate must have at least 6 messages, and must satisfy the Required depth policy (which can require more).
- If readiness.readyForMvp is false, mvpProposal must be null and nextQuestions must contain 2-4 targeted follow-up questions.
- If readiness.readyForMvp is true, nextQuestions must be [] and mvpProposal must be fully populated with cost and estimate fields.
- If readiness.readyForMvp is true, mvpProposal.decisionLog must be populated with concrete architectural/product decisions including rationale, alternatives, and explicit impacts.
- If an existing MVP proposal is provided, treat this as a revision cycle: keep what still works, adjust what the user's remarks challenge, and explain tradeoffs.
- If allowAssumptions is true (${allowAssumptions}), you may proceed with a best-effort MVP using explicit assumptions instead of blocking for more questions.
- Treat this as a robust system design exercise, not a toy or "cute MVP". Prioritize production-grade architecture.
- If the problem involves external platform automation, integrations, scraping, or repetitive outbound actions, the debate and risk model must explicitly cover:
  - rate limits and throttling
  - detection / trust-score / reputation risk
  - blocking or suspension vectors (IP, account, app credentials, tenant)
  - legal / terms-of-service constraints
- If cloud_architect and lead_developer personas are present, their recommendations must heavily influence architecture and implementation decisions.
- Be specific, concrete, and realistic. No fluff.
- COST REALISM IS CRITICAL — TWO SEPARATE CONCERNS:
  1. BUILD COST: Dystoppia builds with AI, not human teams. AI-assisted development costs are 10-50x lower than traditional teams. A podcast clipper MVP that costs $180k with humans costs $1k-$5k with AI. Never quote human-team prices as the primary estimate — always lead with AI-assisted cost.
  2. OPERATING COST: Most micro-SaaS MVPs launch for $50-$300/month in infra. A single VPS or small managed DB + object storage + CDN is enough for 0-1000 users. Only estimate $1000+/month when the system genuinely requires GPUs, heavy compute, or massive storage at scale.
  The depth tier measures ANALYSIS rigor, not budget size. An "advanced" depth tier means the analysis must be thorough — it does NOT mean the product must be expensive. A $100/month micro-SaaS can have advanced-tier analysis. Always estimate costs proportional to actual resource consumption at the described user scale, not to the ambition of the language used.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      messages: [{ role: "user", content: "Generate the refined debate and MVP proposal based on the context provided." }],
      system: systemPrompt,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    let parsed = parseJsonObject(text);

    const initialGaps = findDepthGaps(parsed, depthAssessment);
    if (initialGaps.length > 0) {
      const repairResponse = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 5000,
        system: `You are revising a JSON MVP proposal to satisfy strict depth requirements.

Return ONLY valid JSON in the same schema as before.
Do not remove existing valid content; expand and strengthen it.

Depth policy:
${depthGuidance}

Detected gaps that must be fixed:
${initialGaps.map((gap, i) => `${i + 1}. ${gap}`).join("\n")}`,
        messages: [
          {
            role: "user",
            content: `Revise this JSON and close all gaps:\n\n${JSON.stringify(parsed, null, 2)}`,
          },
        ],
      });

      const repairText =
        repairResponse.content[0].type === "text"
          ? repairResponse.content[0].text
          : "";
      parsed = parseJsonObject(repairText);
    }

    const readinessRaw =
      parsed.readiness && typeof parsed.readiness === "object"
        ? (parsed.readiness as {
            readyForMvp?: unknown;
            reason?: unknown;
            missingInfo?: unknown;
          })
        : null;

    const finalGaps = findDepthGaps(parsed, depthAssessment);
    const gateBlocked = finalGaps.length > 0;
    const modelReady = readinessRaw?.readyForMvp === true;
    const readyForMvp = modelReady && !gateBlocked;
    const modelMissing = Array.isArray(readinessRaw?.missingInfo)
      ? readinessRaw.missingInfo
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const missingInfo = uniqueStrings([...modelMissing, ...finalGaps]);

    const gateQuestions = gateBlocked
      ? buildGateQuestionsFromGaps(finalGaps)
      : [];
    const modelQuestions = normalizeClarifyingQuestions(parsed.nextQuestions);
    const nextQuestions = !readyForMvp
      ? gateQuestions.length >= 2
        ? gateQuestions
        : [...gateQuestions, ...modelQuestions].slice(0, 4)
      : [];

    const readinessReason = readyForMvp
      ? typeof readinessRaw?.reason === "string"
        ? readinessRaw.reason
        : "MVP passed definition-of-ready gates."
      : gateBlocked
        ? `Not ready for MVP yet. Definition-of-ready gates failed in ${finalGaps.length} area(s): ${finalGaps.join(
            "; "
          )}.`
        : typeof readinessRaw?.reason === "string"
          ? readinessRaw.reason
          : "Not ready for MVP yet.";

    const result = {
      refinedDebate: Array.isArray(parsed.refinedDebate)
        ? parsed.refinedDebate
        : [],
      readiness: {
        readyForMvp,
        reason: readinessReason,
        missingInfo,
      },
      nextQuestions,
      mvpProposal:
        readyForMvp &&
        parsed.mvpProposal &&
        typeof parsed.mvpProposal === "object"
          ? parsed.mvpProposal
          : null,
      nextActions: Array.isArray(parsed.nextActions)
        ? parsed.nextActions
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      readinessGate: {
        passed: !gateBlocked,
        gaps: finalGaps,
      },
      depthProfile: {
        tier: depthAssessment.tier,
        score: depthAssessment.score,
        reasons: depthAssessment.reasons,
      },
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Refinement failed:", err);
    return NextResponse.json({ error: "Failed to refine proposal" }, { status: 500 });
  }
}
