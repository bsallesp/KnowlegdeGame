import type { ActionClass, UserRole } from "@/lib/authorization";

export type ExecutionTarget =
  | "planning_only"
  | "research_read_only"
  | "artifact_generation"
  | "infrastructure_mutation"
  | "domain_mutation"
  | "ads_mutation"
  | "unknown_external_execution";

export type ExecutionPolicyStatus =
  | "allowed"
  | "approval_required"
  | "manual_only"
  | "blocked";

export type ExecutionMode = "dry_run" | "live";

export interface ExecutionPolicyResult {
  target: ExecutionTarget;
  policyStatus: ExecutionPolicyStatus;
  executorType: "none" | "external_research_executor";
  allowedInMvp: boolean;
  requiresApproval: boolean;
  requiresEnv: boolean;
  recommendedExecutionMode: ExecutionMode;
  reasons: string[];
}

interface EvaluateExecutionPolicyInput {
  prompt: string;
  actionClass: ActionClass;
  role: UserRole;
}

const RESEARCH_PATTERNS = [
  /\breddit\b/i,
  /\bsentiment\b/i,
  /\bcompetitor\b/i,
  /\bopinions?\b/i,
  /\bbusiness model\b/i,
  /\bmarket\b/i,
  /\bscan\b.*\bapp\b/i,
];

const INFRA_PATTERNS = [
  /\bcreate\s+vm\b/i,
  /\bvirtual machine\b/i,
  /\bcreate\s+database\b/i,
  /\bprovision\b/i,
  /\bdeploy\b/i,
  /\bkubernetes\b/i,
  /\bterraform\b/i,
  /\bproduction\b/i,
];

const DOMAIN_PATTERNS = [/\bgo ?daddy\b/i, /\bnamecheap\b/i, /\bdns\b/i, /\bdomain\b/i];
const ADS_PATTERNS = [/\bmeta ads\b/i, /\bgoogle ads\b/i, /\bcampaign\b/i, /\bad account\b/i];

function matchesAny(prompt: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(prompt));
}

export function evaluateExecutionPolicy({
  prompt,
  actionClass,
  role,
}: EvaluateExecutionPolicyInput): ExecutionPolicyResult {
  const reasons: string[] = [];

  if (matchesAny(prompt, INFRA_PATTERNS)) {
    reasons.push("Infrastructure mutation remains blocked in the MVP.");
    return {
      target: "infrastructure_mutation",
      policyStatus: "blocked",
      executorType: "none",
      allowedInMvp: false,
      requiresApproval: true,
      requiresEnv: false,
      recommendedExecutionMode: "dry_run",
      reasons,
    };
  }

  if (matchesAny(prompt, DOMAIN_PATTERNS)) {
    reasons.push("Domain and DNS mutations remain manual-only in the MVP.");
    return {
      target: "domain_mutation",
      policyStatus: "manual_only",
      executorType: "none",
      allowedInMvp: false,
      requiresApproval: true,
      requiresEnv: false,
      recommendedExecutionMode: "dry_run",
      reasons,
    };
  }

  if (matchesAny(prompt, ADS_PATTERNS)) {
    reasons.push("Advertising platform mutations remain manual-only in the MVP.");
    return {
      target: "ads_mutation",
      policyStatus: "manual_only",
      executorType: "none",
      allowedInMvp: false,
      requiresApproval: true,
      requiresEnv: false,
      recommendedExecutionMode: "dry_run",
      reasons,
    };
  }

  if (matchesAny(prompt, RESEARCH_PATTERNS) && actionClass !== "privileged_execution") {
    reasons.push("Read-only external research can use the first policy-controlled executor.");
    return {
      target: "research_read_only",
      policyStatus: "allowed",
      executorType: "external_research_executor",
      allowedInMvp: role === "master",
      requiresApproval: false,
      requiresEnv: true,
      recommendedExecutionMode: "dry_run",
      reasons,
    };
  }

  if (actionClass === "privileged_execution") {
    reasons.push("Unknown external execution remains approval-required and manual in the MVP.");
    return {
      target: "unknown_external_execution",
      policyStatus: "approval_required",
      executorType: "none",
      allowedInMvp: false,
      requiresApproval: true,
      requiresEnv: false,
      recommendedExecutionMode: "dry_run",
      reasons,
    };
  }

  reasons.push("This request should stay in planning mode.");
  return {
    target: actionClass === "billable_generation" ? "artifact_generation" : "planning_only",
    policyStatus: "manual_only",
    executorType: "none",
    allowedInMvp: false,
    requiresApproval: false,
    requiresEnv: false,
    recommendedExecutionMode: "dry_run",
    reasons,
  };
}
