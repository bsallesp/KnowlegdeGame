import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/authGuard";
import {
  attachAcademicSkillCatalog,
  AZURE_RESOURCE_CANDIDATE_POOL,
  AZURE_RESOURCE_TOP_CHOICES,
  CLOUD_ARCHITECT_PERSONA_ID,
  CUSTOMER_SUCCESS_PERSONA_ID,
  DEVELOPER_STACK_CANDIDATE_POOL,
  DEVELOPER_STACK_TOP_CHOICES,
  LEAD_DEVELOPER_PERSONA_ID,
  PersonaCatalogType,
  POPULARITY_RELIABILITY_BASIS,
  SkillDomain,
} from "@/lib/prePersonas";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestions: string[];
}

interface DebateMessage {
  personaId: string;
  message: string;
  replyTo: string | null;
}

interface Persona {
  id: string;
  name: string;
  emoji: string;
  reason: string;
  initialThought: string;
  isMandatory?: boolean;
  candidateCatalogType?: PersonaCatalogType;
  candidatePool?: string[];
  candidateTopChoices?: string[];
  rankingBasis?: string;
  skillDomain?: SkillDomain;
}

function toSnakeCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePersona(input: unknown): Persona | null {
  if (!input || typeof input !== "object") return null;

  const raw = input as {
    id?: unknown;
    name?: unknown;
    emoji?: unknown;
    reason?: unknown;
    initialThought?: unknown;
  };

  const id =
    typeof raw.id === "string" ? toSnakeCase(raw.id) : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const emoji = typeof raw.emoji === "string" ? raw.emoji.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const initialThought =
    typeof raw.initialThought === "string" ? raw.initialThought.trim() : "";

  if (!id || !name || !emoji || !reason || !initialThought) return null;

  return { id, name, emoji, reason, initialThought };
}

function normalizeInitialDebate(
  input: unknown,
  allowedPersonaIds: Set<string>
): DebateMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as {
        personaId?: unknown;
        message?: unknown;
        replyTo?: unknown;
      };

      const personaId =
        typeof raw.personaId === "string" ? toSnakeCase(raw.personaId) : "";
      const message = typeof raw.message === "string" ? raw.message.trim() : "";
      const replyTo =
        typeof raw.replyTo === "string" ? toSnakeCase(raw.replyTo) : null;

      if (!personaId || !message || !allowedPersonaIds.has(personaId)) return null;

      return {
        personaId,
        message,
        replyTo:
          replyTo && allowedPersonaIds.has(replyTo) ? replyTo : null,
      };
    })
    .filter((entry): entry is DebateMessage => entry !== null);
}

function extractJsonString(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return codeBlockMatch ? codeBlockMatch[1] : text;
}

function parseJsonObject(text: string): Record<string, unknown> {
  return JSON.parse(extractJsonString(text)) as Record<string, unknown>;
}

function buildCloudArchitectPrePersona(prompt: string): Persona {
  return {
    id: CLOUD_ARCHITECT_PERSONA_ID,
    name: "Cloud Architect",
    emoji: "☁️",
    reason:
      "Mandatory persona to guarantee robust cloud architecture, enterprise-grade reliability, and cost-aware Azure decisions from day one.",
    initialThought: `For "${prompt}", I will define a production-first Azure architecture with clear security boundaries, resilience targets, and operational controls before we commit to implementation scope.`,
    isMandatory: true,
    candidateCatalogType: "azure_resources",
    candidatePool: [...AZURE_RESOURCE_CANDIDATE_POOL],
    candidateTopChoices: [...AZURE_RESOURCE_TOP_CHOICES],
    rankingBasis: POPULARITY_RELIABILITY_BASIS,
  };
}

function buildLeadDeveloperPrePersona(prompt: string): Persona {
  return {
    id: LEAD_DEVELOPER_PERSONA_ID,
    name: "Lead Developer",
    emoji: "🧑‍💻",
    reason:
      "Mandatory persona to drive implementation realism, trusted technology choices, and maintainable delivery plans aligned with production constraints.",
    initialThought: `For "${prompt}", I will prioritize proven frameworks and libraries, enforce strong engineering baselines, and de-risk delivery through incremental architecture decisions.`,
    isMandatory: true,
    candidateCatalogType: "developer_stack",
    candidatePool: [...DEVELOPER_STACK_CANDIDATE_POOL],
    candidateTopChoices: [...DEVELOPER_STACK_TOP_CHOICES],
    rankingBasis: POPULARITY_RELIABILITY_BASIS,
  };
}

function buildCustomerSuccessFallbackPersona(prompt: string): Persona {
  return {
    id: CUSTOMER_SUCCESS_PERSONA_ID,
    name: "Customer Success Manager",
    emoji: "🤝",
    reason:
      "Mandatory user-facing persona that clarifies requirements, aligns decisions, and keeps scope tied to business outcomes.",
    initialThought: `For "${prompt}", I need to validate goals, constraints, and expected outcomes so the team can move fast without making hidden assumptions.`,
  };
}

function withMandatoryPrePersonas(input: unknown, prompt: string): Persona[] {
  const parsed = Array.isArray(input)
    ? input
        .map((item) => normalizePersona(item))
        .filter((persona): persona is Persona => persona !== null)
    : [];

  const byId = new Map(parsed.map((persona) => [persona.id, persona]));
  const cloudBase = buildCloudArchitectPrePersona(prompt);
  const devBase = buildLeadDeveloperPrePersona(prompt);
  const csBase = buildCustomerSuccessFallbackPersona(prompt);

  const cloudExisting = byId.get(CLOUD_ARCHITECT_PERSONA_ID);
  byId.set(CLOUD_ARCHITECT_PERSONA_ID, {
    ...cloudBase,
    ...(cloudExisting ?? {}),
    id: CLOUD_ARCHITECT_PERSONA_ID,
    candidateCatalogType: "azure_resources",
    candidatePool: [...AZURE_RESOURCE_CANDIDATE_POOL],
    candidateTopChoices: [...AZURE_RESOURCE_TOP_CHOICES],
    rankingBasis: POPULARITY_RELIABILITY_BASIS,
    isMandatory: true,
  });

  const devExisting = byId.get(LEAD_DEVELOPER_PERSONA_ID);
  byId.set(LEAD_DEVELOPER_PERSONA_ID, {
    ...devBase,
    ...(devExisting ?? {}),
    id: LEAD_DEVELOPER_PERSONA_ID,
    candidateCatalogType: "developer_stack",
    candidatePool: [...DEVELOPER_STACK_CANDIDATE_POOL],
    candidateTopChoices: [...DEVELOPER_STACK_TOP_CHOICES],
    rankingBasis: POPULARITY_RELIABILITY_BASIS,
    isMandatory: true,
  });

  const csExisting = byId.get(CUSTOMER_SUCCESS_PERSONA_ID);
  byId.set(CUSTOMER_SUCCESS_PERSONA_ID, {
    ...csBase,
    ...(csExisting ?? {}),
    id: CUSTOMER_SUCCESS_PERSONA_ID,
  });

  const mandatoryOrder = [
    CLOUD_ARCHITECT_PERSONA_ID,
    LEAD_DEVELOPER_PERSONA_ID,
    CUSTOMER_SUCCESS_PERSONA_ID,
  ];

  const mandatory = mandatoryOrder
    .map((id) => byId.get(id))
    .filter((persona): persona is Persona => Boolean(persona));

  const optional = Array.from(byId.values()).filter(
    (persona) => !mandatoryOrder.includes(persona.id)
  );

  return [...mandatory, ...optional].map((persona) =>
    attachAcademicSkillCatalog(persona)
  );
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

  const personaDiscoveryPrompt = `You are a system that analyzes a user's business/product request and identifies the professional personas (skills) needed to properly evaluate and deliver that request.

You must be REALISTIC. Not pessimistic, not optimistic. Identify exactly the skills that are truly necessary.

Mandatory pre-personas in every project:
- "${CLOUD_ARCHITECT_PERSONA_ID}" (Cloud Architect): must anchor architecture decisions in robust, production-grade Azure patterns.
- "${LEAD_DEVELOPER_PERSONA_ID}" (Lead Developer): must anchor implementation decisions in proven, reliable, and maintainable engineering practices.
- "${CUSTOMER_SUCCESS_PERSONA_ID}" (Customer Success Manager): user-facing clarifications and alignment.

For each persona, provide:
- id: a short snake_case identifier
- name: the professional title (e.g. "Software Architect", "Healthcare Compliance Specialist")
- emoji: a single emoji that represents this persona
- reason: a one-sentence explanation of why this persona is needed for THIS specific request
- initialThought: what this persona's first professional reaction/concern/insight would be about the request (2-3 sentences, in first person, realistic tone)

ALWAYS include "${CUSTOMER_SUCCESS_PERSONA_ID}" — this is the one who interfaces with the user, asks clarifying questions, and translates between the technical team and the user.

Return ONLY valid JSON in this exact format:
{
  "personas": [...],
  "projectSummary": "one paragraph summarizing what the user seems to want"
}

Do not generate debate or questions in this step. Only personas and summary.
`;

  const debateAndQuestionsPrompt = (enrichedPersonas: Persona[], summary: string) => `You are a system that generates an internal alignment debate and clarifying questions for a project team.

Project request:
"${prompt.trim()}"

Project summary:
${summary}

Team members (with pre-lifted candidate skill/resource catalogs):
${enrichedPersonas
  .map((persona) => {
    const catalog = persona.candidateCatalogType
      ? `\n  Catalog: ${persona.candidateCatalogType}`
      : "";
    const domain = persona.skillDomain ? `\n  Skill domain: ${persona.skillDomain}` : "";
    const top =
      Array.isArray(persona.candidateTopChoices) && persona.candidateTopChoices.length > 0
        ? `\n  Top candidates: ${persona.candidateTopChoices.slice(0, 20).join(", ")}`
        : "";
    const mandatory = persona.isMandatory ? " [mandatory]" : "";
    return `- ${persona.emoji} ${persona.name} (${persona.id})${mandatory}: ${persona.reason}${catalog}${domain}${top}`;
  })
  .join("\n")}

Rules:
- Build a realistic debate with 6-10 messages, each 2-4 sentences.
- The debate should include concerns, tradeoffs, unknowns, and execution constraints.
- For external automation/scraping/platform integrations, explicitly address:
  - rate limiting / throttling
  - detection / trust-score / reputation risks
  - blocking/suspension vectors (IP, account, app credentials, tenant)
  - legal and terms-of-service constraints
- End the debate with the customer_success persona summarizing what still needs user input.
- Then produce 3-6 clarifying questions with 3-4 concrete suggestion options each.

Return ONLY valid JSON in this exact format:
{
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
}`;

  try {
    const personaResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `User request: "${prompt.trim()}"`,
        },
      ],
      system: personaDiscoveryPrompt,
    });

    const personaText =
      personaResponse.content[0].type === "text"
        ? personaResponse.content[0].text
        : "";
    const parsed = parseJsonObject(personaText);
    const projectSummary =
      typeof parsed.projectSummary === "string"
        ? parsed.projectSummary
        : "No summary provided by the model.";
    const enrichedPersonas = withMandatoryPrePersonas(
      parsed.personas,
      prompt.trim()
    );

    const debateResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: "Generate internal debate and clarifying questions for this team.",
        },
      ],
      system: debateAndQuestionsPrompt(enrichedPersonas, projectSummary),
    });
    const debateText =
      debateResponse.content[0].type === "text"
        ? debateResponse.content[0].text
        : "";
    const debateParsed = parseJsonObject(debateText);
    const personaIds = new Set(enrichedPersonas.map((persona) => persona.id));

    const result = {
      personas: enrichedPersonas,
      projectSummary,
      initialDebate: normalizeInitialDebate(
        debateParsed.initialDebate,
        personaIds
      ),
      clarifyingQuestions: normalizeClarifyingQuestions(
        debateParsed.clarifyingQuestions
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
