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
  let estimatedInputTokens = 1200;
  let estimatedOutputTokens = 1800;
  let providerCostUsd = 0.045;
  let overheadUsd = 0.02;
  let safetyBufferUsd = 0.015;
  let estimatedCredits = 8;
  let viabilityStatus: ViabilityStatus = "approved";
  let confidence: "low" | "medium" | "high" = "medium";

  if (promptLength >= 400 || /architecture|roadmap|backlog|competitive|business model/i.test(trimmed)) {
    complexity = "medium";
    estimatedInputTokens = 2200;
    estimatedOutputTokens = 3200;
    providerCostUsd = 0.085;
    overheadUsd = 0.035;
    safetyBufferUsd = 0.025;
    estimatedCredits = 18;
    confidence = "medium";
  }

  if (
    promptLength >= 900 ||
    /multi-tenant|orchestrate|infrastructure|terraform|kubernetes|microservices/i.test(trimmed)
  ) {
    complexity = "large";
    estimatedInputTokens = 3800;
    estimatedOutputTokens = 5200;
    providerCostUsd = 0.16;
    overheadUsd = 0.06;
    safetyBufferUsd = 0.04;
    estimatedCredits = 35;
    viabilityStatus = "approved_with_warning";
    confidence = "low";
    reasons.push("Request looks broad and likely requires larger planning effort.");
  }

  if (containsRiskyExecution) {
    actionClass = "privileged_execution";
    viabilityStatus = complexity === "small" ? "reduce_scope" : "approved_with_warning";
    estimatedCredits += 5;
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
    providerCostUsd = 0;
    overheadUsd = 0;
    safetyBufferUsd = 0;
    estimatedCredits = 0;
    viabilityStatus = "reject";
    confidence = "low";
    reasons.push("Request exceeds the MVP safety boundary.");
  }

  const totalCostUsd = Number(
    (providerCostUsd + overheadUsd + safetyBufferUsd).toFixed(4)
  );

  if (reasons.length === 0) {
    reasons.push("Request fits the current Builder planning workflow.");
  }

  return {
    complexity,
    actionClass,
    estimatedInputTokens,
    estimatedOutputTokens,
    providerCostUsd,
    overheadUsd,
    safetyBufferUsd,
    totalCostUsd,
    estimatedCredits,
    viabilityStatus,
    confidence,
    reasons,
  };
}
