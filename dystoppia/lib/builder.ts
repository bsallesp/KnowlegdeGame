import Anthropic from "@anthropic-ai/sdk";
import type { BuilderCostEstimate } from "@/lib/costEngine";
import {
  buildBuilderVerification,
  formatVerificationWarnings,
  normalizeBuilderPayload,
} from "@/lib/builderValidation";
import type {
  BuilderStructuredResult,
  BuilderVerificationFinding,
  SystemArchitecture,
} from "@/types";
import { logLLMUsage } from "@/lib/llmLogger";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BUILDER_MODEL = "claude-sonnet-4-6";

interface BuilderResultInput {
  prompt: string;
  estimate: BuilderCostEstimate;
  userId?: string;
}

const SYSTEM_PROMPT = `You are Dystoppia Builder — a senior solutions architect AI that produces extremely detailed system architecture specifications.

Your job: given a user's product/app description, produce a COMPLETE architecture document that scales proportionally to the complexity of the request.

## Rules

1. **Proportional depth.** A static landing page gets a simple spec (few resources, one environment). A distributed SaaS platform with real-time features gets dozens of resources, multiple environments, detailed data flows, security boundaries, and failure modes. NEVER over-engineer a simple request, and NEVER under-specify a complex one.

2. **Every resource must be concrete.** Name the specific technology (e.g., "PostgreSQL 16 on AWS RDS", not "a database"). Include purpose, scaling strategy, and estimated monthly cost range in USD.

3. **Data flows are mandatory.** Every communication between components must be documented: protocol, sync/async, data type.

4. **Security is not optional.** Identify security boundaries, controls, and threat vectors proportional to the system's attack surface.

5. **Failure modes are mandatory for any system beyond a static site.** For each critical component, describe what happens when it fails, the impact, mitigation strategy, RTO, and RPO.

6. **Cost must be realistic.** Use real-world cloud pricing (AWS/Azure/GCP). Give min/max ranges. A static site on S3+CloudFront might cost $1-5/mo. A multi-region microservices platform might cost $2,000-15,000/mo. Be honest.

7. **Development plan as milestones.** Break the build into numbered phases with deliverables, estimated weeks, and dependencies.

8. **Tradeoffs are explicit.** State what you're choosing and what you're sacrificing. "We use a monolith to reduce operational complexity at the cost of independent deployability."

9. **Be opinionated.** Don't give 5 options — pick the best one for this specific case and justify it. Mention alternatives only when the choice is genuinely close.

10. **Language: respond in the same language the user wrote the prompt in.**

## Output format

You MUST respond with valid JSON matching this exact schema (no markdown, no code fences, just raw JSON):

{
  "requestUnderstanding": "string — what the user wants, in your own words",
  "assumptions": ["string — each assumption you're making"],
  "recommendedScope": "string — what should be built first (MVP cut)",
  "architecture": {
    "classification": "static_site|single_page_app|server_rendered_app|monolith|modular_monolith|client_server|microservices|event_driven|serverless|data_pipeline|ml_platform|hybrid",
    "summary": "string — 2-4 sentences describing the overall architecture approach",
    "principles": ["string — key architectural principles guiding this design"],
    "resources": [
      {
        "id": "string — short kebab-case identifier (e.g. 'primary-db', 'api-server')",
        "name": "string — human-readable name",
        "category": "compute|database|cache|queue|storage|cdn|dns|load_balancer|api_gateway|auth|monitoring|logging|ci_cd|container_registry|secret_management|email|search|analytics|ml_inference|scheduler|event_bus|service_mesh|waf|vpn|other",
        "technology": "string — specific tech and version (e.g. 'PostgreSQL 16 on AWS RDS')",
        "purpose": "string — what this resource does in the system",
        "tier": "essential|recommended|optional",
        "scalingStrategy": "string — how this scales (vertical, horizontal, auto-scaling rules, etc.)",
        "estimatedMonthlyCostUsd": { "min": 0, "max": 0 },
        "notes": "string — any important configuration notes"
      }
    ],
    "dataFlows": [
      {
        "from": "string — resource id or external actor",
        "to": "string — resource id",
        "protocol": "string — HTTP/REST, gRPC, WebSocket, TCP, AMQP, etc.",
        "description": "string — what data moves and why",
        "dataType": "string — JSON, binary, events, etc.",
        "async": false
      }
    ],
    "environments": [
      {
        "name": "string — e.g. 'production', 'staging', 'development'",
        "purpose": "string",
        "resources": ["string — resource ids active in this environment"],
        "estimatedMonthlyCostUsd": { "min": 0, "max": 0 }
      }
    ],
    "securityBoundaries": [
      {
        "name": "string",
        "scope": "string — what this boundary protects",
        "controls": ["string — security controls in place"],
        "threats": ["string — threat vectors this addresses"]
      }
    ],
    "failureModes": [
      {
        "component": "string — resource id",
        "failureScenario": "string",
        "impact": "string",
        "mitigationStrategy": "string",
        "rto": "string — recovery time objective",
        "rpo": "string — recovery point objective"
      }
    ],
    "costBreakdown": [
      {
        "category": "string — e.g. 'Compute', 'Data', 'Networking'",
        "items": ["string — line items"],
        "estimatedMonthlyCostUsd": { "min": 0, "max": 0 }
      }
    ],
    "totalEstimatedMonthlyCostUsd": { "min": 0, "max": 0 },
    "scalingNotes": "string — how the system scales as load grows",
    "tradeoffs": ["string — explicit architectural tradeoffs made"]
  },
  "developmentPlan": [
    {
      "phase": 1,
      "name": "string",
      "deliverables": ["string"],
      "estimatedWeeks": 0,
      "dependencies": ["string — what must exist before this phase"]
    }
  ],
  "devopsPlan": ["string — each DevOps concern addressed"],
  "businessNotes": ["string — economic and business considerations"],
  "competitiveAssessment": "string — competitive landscape analysis",
  "warnings": ["string — risks and concerns"],
  "nextSteps": ["string — immediate actionable next steps"]
}

IMPORTANT: Respond ONLY with valid JSON. No markdown formatting, no code blocks, no explanatory text outside the JSON.`;

const AUDITOR_SYSTEM_PROMPT = `You are Dystoppia Builder Auditor — a skeptical principal architect reviewing an already-generated architecture spec.

Your job is NOT to improve or rewrite the design. Your job is to identify concrete red flags that are directly supported by the provided request and architecture JSON.

Flag only issues you can defend from the supplied material and common platform constraints. Avoid speculation.

Focus on:
- cost ranges that are internally inconsistent or implausible
- incompatible technology combinations
- deployment assumptions that break the listed stack
- timelines that do not fit the listed scope
- scaling claims unsupported by the listed resources
- missing critical infrastructure for the chosen architecture
- failure-mode claims that do not make physical sense

Return ONLY valid JSON in this exact shape:
{
  "redFlags": [
    {
      "severity": "warning|critical",
      "category": "cost|compatibility|timeline|scaling|failure_mode|missing_component",
      "message": "string"
    }
  ]
}

If there are no concrete red flags, return {"redFlags":[]}.`;

function stripCodeFences(rawText: string): string {
  if (!rawText.startsWith("```")) return rawText;
  return rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function dedupeFindingsByMessage(findings: BuilderVerificationFinding[]): BuilderVerificationFinding[] {
  const seen = new Set<string>();
  const result: BuilderVerificationFinding[] = [];

  for (const finding of findings) {
    const key = finding.message.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }

  return result;
}

async function runAuditPass(args: {
  prompt: string;
  payload: ReturnType<typeof normalizeBuilderPayload>["payload"];
  userId?: string;
}): Promise<{
  findings: BuilderVerificationFinding[];
  inputTokens: number;
  outputTokens: number;
}> {
  try {
    const response = await client.messages.create({
      model: BUILDER_MODEL,
      max_tokens: 2200,
      system: AUDITOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            request: args.prompt.trim(),
            architecture: args.payload.architecture,
            developmentPlan: args.payload.developmentPlan,
            devopsPlan: args.payload.devopsPlan,
          }),
        },
      ],
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    logLLMUsage({
      userId: args.userId ?? null,
      model: BUILDER_MODEL,
      endpoint: "builder_audit",
      inputTokens,
      outputTokens,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text block in builder audit response");
    }

    const parsed = JSON.parse(stripCodeFences(textBlock.text.trim())) as {
      redFlags?: Array<{
        severity?: string;
        category?: string;
        message?: string;
      }>;
    };

    const findings = Array.isArray(parsed.redFlags)
      ? parsed.redFlags
          .map<BuilderVerificationFinding | null>((flag, index) => {
            const severity =
              flag?.severity === "critical" || flag?.severity === "warning"
                ? flag.severity
                : "warning";
            const message = typeof flag?.message === "string" ? flag.message.trim() : "";
            const category = typeof flag?.category === "string" ? flag.category.trim() : "general";

            if (!message) return null;

            return {
              code: `audit_${category || "general"}_${index + 1}`,
              severity,
              source: "audit" as const,
              message,
            };
          })
          .filter((finding): finding is BuilderVerificationFinding => finding !== null)
      : [];

    return {
      findings: dedupeFindingsByMessage(findings),
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    return {
      findings: [
        {
          code: "audit_unavailable",
          severity: "warning",
          source: "audit",
          message: `Secondary audit pass did not complete: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export async function buildStructuredBuilderResult({
  prompt,
  estimate,
  userId,
}: BuilderResultInput): Promise<BuilderStructuredResult> {
  const blockedExecutionWarnings =
    estimate.actionClass === "privileged_execution"
      ? [
          "Execution-oriented steps are not performed automatically in this MVP.",
          "External actions should be converted into a manual or approval-gated plan.",
        ]
      : [];

  try {
    const generationResponse = await client.messages.create({
      model: BUILDER_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt.trim(),
        },
      ],
    });

    const generationInputTokens = generationResponse.usage?.input_tokens ?? 0;
    const generationOutputTokens = generationResponse.usage?.output_tokens ?? 0;

    logLLMUsage({
      userId: userId ?? null,
      model: BUILDER_MODEL,
      endpoint: "builder",
      inputTokens: generationInputTokens,
      outputTokens: generationOutputTokens,
    });

    const textBlock = generationResponse.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text block in LLM response");
    }

    const parsed = JSON.parse(stripCodeFences(textBlock.text.trim())) as Omit<
      BuilderStructuredResult,
      "costSummary" | "verification"
    >;
    const normalized = normalizeBuilderPayload(parsed);
    const shouldRunAudit =
      normalized.payload.architecture.resources.length > 0 &&
      !normalized.findings.some((finding) => finding.severity === "critical");
    const auditResult = shouldRunAudit
      ? await runAuditPass({
          prompt,
          payload: normalized.payload,
          userId,
        })
      : { findings: [] as BuilderVerificationFinding[], inputTokens: 0, outputTokens: 0 };
    const verification = buildBuilderVerification({
      prompt,
      estimate,
      payload: normalized.payload,
      schemaFindings: normalized.findings,
      auditFindings: auditResult.findings,
    });
    const inputTokens = generationInputTokens + auditResult.inputTokens;
    const outputTokens = generationOutputTokens + auditResult.outputTokens;
    const verificationWarnings = formatVerificationWarnings(verification);
    const warnings = dedupeStrings([
      ...normalized.payload.warnings,
      ...verificationWarnings,
      ...estimate.reasons,
      ...blockedExecutionWarnings,
    ]);
    const nextSteps =
      verification.status === "passed"
        ? normalized.payload.nextSteps
        : dedupeStrings([
            "Review the verification findings before treating this plan as implementation-ready.",
            ...normalized.payload.nextSteps,
          ]);

    const result: BuilderStructuredResult = {
      requestUnderstanding: normalized.payload.requestUnderstanding,
      assumptions: normalized.payload.assumptions,
      recommendedScope: normalized.payload.recommendedScope,
      architecture: normalized.payload.architecture ?? buildFallbackArchitecture(),
      developmentPlan: normalized.payload.developmentPlan,
      devopsPlan: normalized.payload.devopsPlan,
      businessNotes: normalized.payload.businessNotes,
      competitiveAssessment: normalized.payload.competitiveAssessment,
      costSummary: {
        estimatedCredits: estimate.estimatedCredits,
        estimatedCostUsd: estimate.totalCostUsd,
        viabilityStatus: estimate.viabilityStatus,
        confidence: verification.confidence,
        _realTokens: { inputTokens, outputTokens },
      },
      verification,
      warnings,
      nextSteps,
    };

    return result;
  } catch (error) {
    // Fallback: return a minimal result indicating the LLM call failed
    return buildFallbackResult(prompt, estimate, blockedExecutionWarnings, error);
  }
}

function buildFallbackArchitecture(): SystemArchitecture {
  return {
    classification: "monolith",
    summary: "Architecture analysis could not be completed. Please retry the request.",
    principles: [],
    resources: [],
    dataFlows: [],
    environments: [],
    securityBoundaries: [],
    failureModes: [],
    costBreakdown: [],
    totalEstimatedMonthlyCostUsd: { min: 0, max: 0 },
    scalingNotes: "",
    tradeoffs: [],
  };
}

function buildFallbackResult(
  prompt: string,
  estimate: BuilderCostEstimate,
  blockedExecutionWarnings: string[],
  error: unknown,
): BuilderStructuredResult {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    requestUnderstanding: `Dystoppia received this request but the architecture analysis could not be completed: "${prompt.trim().slice(0, 200)}".`,
    assumptions: [
      "The LLM analysis did not complete successfully.",
      "This may be due to a transient error or an overly complex prompt.",
    ],
    recommendedScope: "Retry the request. If the error persists, try simplifying or splitting the prompt.",
    architecture: buildFallbackArchitecture(),
    developmentPlan: [],
    devopsPlan: [],
    businessNotes: [],
    competitiveAssessment: "",
    costSummary: {
      estimatedCredits: estimate.estimatedCredits,
      estimatedCostUsd: estimate.totalCostUsd,
      viabilityStatus: estimate.viabilityStatus,
      confidence: "low",
    },
    verification: {
      status: "failed",
      confidence: "low",
      findings: [
        {
          code: "builder_generation_failed",
          severity: "critical",
          source: "schema",
          message: `Builder generation failed before verification: ${errorMessage}`,
        },
      ],
      metrics: {
        totalChecks: 0,
        flaggedChecks: 1,
        criticalFindings: 1,
        warningFindings: 0,
        auditFindings: 0,
      },
    },
    warnings: dedupeStrings([
      `Builder analysis error: ${errorMessage}`,
      ...estimate.reasons,
      ...blockedExecutionWarnings,
    ]),
    nextSteps: ["Retry the Builder request.", "If the issue persists, check API key configuration."],
  };
}
