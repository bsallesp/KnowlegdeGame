import type { ActionClass } from "@/lib/authorization";

export type BuilderComplexity =
  | "small"
  | "medium"
  | "large"
  | "unsafe_or_unknown";

export type ViabilityStatus =
  | "approved"
  | "approved_with_warning"
  | "reduce_scope"
  | "reject";

export interface BuilderCostEstimate {
  complexity: BuilderComplexity;
  actionClass: ActionClass;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  // Legacy fields kept for backward compat — actual pricing is in lib/pricing.ts
  providerCostUsd: number;
  overheadUsd: number;
  safetyBufferUsd: number;
  totalCostUsd: number;
  estimatedCredits: number;
  viabilityStatus: ViabilityStatus;
  confidence: "low" | "medium" | "high";
  reasons: string[];
}

const RISKY_EXECUTION_PATTERNS = [
  /\bcreate\s+vm\b/i,
  /\bvirtual machine\b/i,
  /\bcreate\s+database\b/i,
  /\bprovision\b/i,
  /\bdeploy\b/i,
  /\bgo ?daddy\b/i,
  /\bnamecheap\b/i,
  /\bmeta ads\b/i,
  /\bproduction\b/i,
];

// System prompt is ~2500 tokens
const SYSTEM_PROMPT_TOKENS = 2500;
const AUDIT_PROMPT_TOKENS = 900;
const AUDIT_OUTPUT_TOKENS = 800;

/**
 * Heuristic-only estimation. Returns token estimates and viability
 * classification. Actual cost/credit calculation is done by lib/pricing.ts
 * using the ProviderPricingSnapshot table.
 */
export function estimateBuilderRequest(prompt: string): BuilderCostEstimate {
  const trimmed = prompt.trim();
  const promptLength = trimmed.length;
  const reasons: string[] = [];
  const normalized = trimmed.toLowerCase();

  const containsRiskyExecution = RISKY_EXECUTION_PATTERNS.some((pattern) =>
    pattern.test(trimmed)
  );

  let complexity: BuilderComplexity = "small";
  let actionClass: ActionClass = "billable_generation";
  let generationInputTokens = SYSTEM_PROMPT_TOKENS + 500;
  let generationOutputTokens = 3000;
  let viabilityStatus: ViabilityStatus = "approved";
  let confidence: "low" | "medium" | "high" = "medium";

  if (promptLength >= 400 || /architecture|roadmap|backlog|competitive|business model/i.test(trimmed)) {
    complexity = "medium";
    generationInputTokens = SYSTEM_PROMPT_TOKENS + 800;
    generationOutputTokens = 6000;
    confidence = "medium";
  }

  if (
    promptLength >= 900 ||
    /multi-tenant|orchestrate|infrastructure|terraform|kubernetes|microservices/i.test(trimmed)
  ) {
    complexity = "large";
    generationInputTokens = SYSTEM_PROMPT_TOKENS + 1500;
    generationOutputTokens = 12000;
    viabilityStatus = "approved_with_warning";
    confidence = "low";
    reasons.push("Request looks broad and likely requires larger planning effort.");
  }

  if (containsRiskyExecution) {
    actionClass = "privileged_execution";
    viabilityStatus = complexity === "small" ? "reduce_scope" : "approved_with_warning";
    reasons.push("Request mentions external execution steps that are blocked or approval-gated in the MVP.");
  }

  if (promptLength < 20 || normalized.split(/\s+/).length < 4) {
    viabilityStatus = "approved_with_warning";
    confidence = "low";
    reasons.push("Prompt is short and may need clarification for high-quality output.");
  }

  if (/unlimited|fully autonomous|no approval|bypass/i.test(trimmed)) {
    complexity = "unsafe_or_unknown";
    actionClass = "privileged_execution";
    generationInputTokens = 0;
    generationOutputTokens = 0;
    viabilityStatus = "reject";
    confidence = "low";
    reasons.push("Request exceeds the MVP safety boundary.");
  }

  if (reasons.length === 0) {
    reasons.push("Request fits the current Builder planning workflow.");
  }

  const auditInputTokens =
    generationOutputTokens > 0 ? AUDIT_PROMPT_TOKENS + Math.round(generationOutputTokens * 0.75) : 0;
  const estimatedInputTokens = generationInputTokens + auditInputTokens;
  const estimatedOutputTokens =
    generationOutputTokens > 0 ? generationOutputTokens + AUDIT_OUTPUT_TOKENS : 0;

  // These USD values are rough heuristics for the estimate endpoint only.
  // The real pricing uses ProviderPricingSnapshot × multiplier via lib/pricing.ts.
  const providerCostUsd = estimatedInputTokens * 3 / 1_000_000 + estimatedOutputTokens * 15 / 1_000_000;
  const overheadUsd = 0;
  const safetyBufferUsd = 0;
  const totalCostUsd = Number(providerCostUsd.toFixed(6));

  return {
    complexity,
    actionClass,
    estimatedInputTokens,
    estimatedOutputTokens,
    providerCostUsd,
    overheadUsd,
    safetyBufferUsd,
    totalCostUsd,
    estimatedCredits: 0, // Actual credits computed by pricing engine
    viabilityStatus,
    confidence,
    reasons,
  };
}
