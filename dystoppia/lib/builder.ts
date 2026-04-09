import type { BuilderCostEstimate } from "@/lib/costEngine";

interface BuilderResultInput {
  prompt: string;
  estimate: BuilderCostEstimate;
}

export interface BuilderStructuredResult {
  requestUnderstanding: string;
  assumptions: string[];
  recommendedScope: string;
  architecture: string[];
  developmentPlan: string[];
  devopsPlan: string[];
  businessNotes: string[];
  competitiveAssessment: string;
  costSummary: {
    estimatedCredits: number;
    estimatedCostUsd: number;
    viabilityStatus: string;
    confidence: string;
  };
  warnings: string[];
  nextSteps: string[];
}

export function buildStructuredBuilderResult({
  prompt,
  estimate,
}: BuilderResultInput): BuilderStructuredResult {
  const blockedExecutionWarning =
    estimate.actionClass === "privileged_execution"
      ? [
          "Execution-oriented steps are not performed automatically in this MVP.",
          "External actions should be converted into a manual or approval-gated plan.",
        ]
      : [];

  return {
    requestUnderstanding:
      `Dystoppia interprets this request as a Builder workflow focused on product analysis, software design, implementation planning, and economic feasibility for: "${prompt.trim()}".`,
    assumptions: [
      "The goal is to produce a planning-grade output, not immediate autonomous execution.",
      "The MVP should optimize for safety, cost visibility, and staged delivery.",
      "Any third-party or infrastructure action must remain manual or approval-gated in this phase.",
    ],
    recommendedScope:
      estimate.viabilityStatus === "reduce_scope"
        ? "Reduce the first release to research, specification, and architecture. Keep external execution steps manual."
        : "Start with a planning-first MVP that delivers analysis, architecture, backlog, and cost visibility before operational automation.",
    architecture: [
      "Use a modular platform structure with a Builder module, a Learning module, and a shared governance layer.",
      "Keep orchestration separated from execution so unsafe actions can be blocked without losing planning capability.",
      "Store request history, credits, usage, and audit trails as first-class platform records.",
    ],
    developmentPlan: [
      "Clarify the target app outcome and reduce ambiguity in the request.",
      "Generate a scoped feature list and separate MVP features from future automation.",
      "Produce implementation backlog items grouped by backend, frontend, data, and operations.",
    ],
    devopsPlan: [
      "Keep environments separated and secrets out of code.",
      "Use approval gates for anything that could create infrastructure cost or mutate third-party systems.",
      "Track estimated versus actual usage so deployment and operating costs can be corrected quickly.",
    ],
    businessNotes: [
      "The request should be priced with overhead and safety buffer, not only provider cost.",
      "If customer value does not exceed estimated operating cost plus margin, the scope should be reduced.",
      "Internal master-user activity should remain separately reportable from future customer activity.",
    ],
    competitiveAssessment:
      "Competitive probability should be expressed as a confidence-weighted estimate with explicit assumptions, not as a false claim of precision.",
    costSummary: {
      estimatedCredits: estimate.estimatedCredits,
      estimatedCostUsd: estimate.totalCostUsd,
      viabilityStatus: estimate.viabilityStatus,
      confidence: estimate.confidence,
    },
    warnings: [...estimate.reasons, ...blockedExecutionWarning],
    nextSteps: [
      "Review whether the request should remain planning-only or move into an approval-gated execution track.",
      "Validate the target economics before enabling any costly workflow.",
      "Break the output into implementation milestones and a first deliverable.",
    ],
  };
}
