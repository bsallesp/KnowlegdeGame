import type { BuilderCostEstimate } from "@/lib/costEngine";
import type {
  ArchCostBreakdown,
  ArchDataFlow,
  ArchEnvironment,
  ArchFailureMode,
  ArchMilestone,
  ArchResource,
  ArchSecurityBoundary,
  BuilderStructuredResult,
  BuilderVerificationFinding,
  BuilderVerificationSummary,
  SystemArchitecture,
  SystemClassification,
} from "@/types";

type BuilderLLMPayload = Omit<BuilderStructuredResult, "costSummary" | "verification">;

type FindingSeverity = BuilderVerificationFinding["severity"];
type FindingSource = BuilderVerificationFinding["source"];

interface NormalizationResult {
  payload: BuilderLLMPayload;
  findings: BuilderVerificationFinding[];
}

interface BenchmarkSignals {
  costAligned: boolean;
  timelineAligned: boolean;
  recognizedTechCoverage: number;
  promptSpecificity: "low" | "medium" | "high";
}

interface RuleEvaluationResult {
  findings: BuilderVerificationFinding[];
  checksRun: number;
  signals: BenchmarkSignals;
}

const CLASSIFICATIONS: readonly SystemClassification[] = [
  "static_site",
  "single_page_app",
  "server_rendered_app",
  "monolith",
  "modular_monolith",
  "client_server",
  "microservices",
  "event_driven",
  "serverless",
  "data_pipeline",
  "ml_platform",
  "hybrid",
] as const;

const RESOURCE_CATEGORIES = new Set<ArchResource["category"]>([
  "compute",
  "database",
  "cache",
  "queue",
  "storage",
  "cdn",
  "dns",
  "load_balancer",
  "api_gateway",
  "auth",
  "monitoring",
  "logging",
  "ci_cd",
  "container_registry",
  "secret_management",
  "email",
  "search",
  "analytics",
  "ml_inference",
  "scheduler",
  "event_bus",
  "service_mesh",
  "waf",
  "vpn",
  "other",
]);

const RESOURCE_TIERS = new Set<ArchResource["tier"]>([
  "essential",
  "recommended",
  "optional",
]);

const COST_BENCHMARKS: Record<SystemClassification, { min: number; max: number }> = {
  static_site: { min: 1, max: 20 },
  single_page_app: { min: 5, max: 80 },
  server_rendered_app: { min: 10, max: 150 },
  monolith: { min: 20, max: 500 },
  modular_monolith: { min: 50, max: 800 },
  client_server: { min: 30, max: 700 },
  microservices: { min: 300, max: 5000 },
  event_driven: { min: 150, max: 3000 },
  serverless: { min: 10, max: 400 },
  data_pipeline: { min: 150, max: 4000 },
  ml_platform: { min: 500, max: 10000 },
  hybrid: { min: 250, max: 5000 },
};

const TIMELINE_BENCHMARKS: Record<SystemClassification, { min: number; max: number }> = {
  static_site: { min: 1, max: 3 },
  single_page_app: { min: 2, max: 8 },
  server_rendered_app: { min: 3, max: 10 },
  monolith: { min: 6, max: 20 },
  modular_monolith: { min: 8, max: 24 },
  client_server: { min: 6, max: 20 },
  microservices: { min: 12, max: 36 },
  event_driven: { min: 10, max: 28 },
  serverless: { min: 4, max: 16 },
  data_pipeline: { min: 8, max: 24 },
  ml_platform: { min: 12, max: 32 },
  hybrid: { min: 12, max: 36 },
};

const COMPLEX_CLASSIFICATIONS = new Set<SystemClassification>([
  "monolith",
  "modular_monolith",
  "client_server",
  "microservices",
  "event_driven",
  "serverless",
  "data_pipeline",
  "ml_platform",
  "hybrid",
]);

const KNOWN_TECH_PATTERNS = [
  /\baws\b/i,
  /\bazure\b/i,
  /\bgcp\b/i,
  /\bvercel\b/i,
  /\bcloudflare\b/i,
  /\bnext\.?js\b/i,
  /\breact\b/i,
  /\bnode\.?js\b/i,
  /\bpostgres(?:ql)?\b/i,
  /\bmysql\b/i,
  /\bmongodb\b/i,
  /\bredis\b/i,
  /\bprisma\b/i,
  /\bdocker\b/i,
  /\bkubernetes\b/i,
  /\brds\b/i,
  /\bs3\b/i,
  /\bcloudfront\b/i,
  /\blambda\b/i,
  /\bsqs\b/i,
  /\bsns\b/i,
  /\bkafka\b/i,
  /\brabbitmq\b/i,
  /\bdatadog\b/i,
  /\bgrafana\b/i,
  /\bprometheus\b/i,
  /\belasticsearch\b/i,
  /\bmeilisearch\b/i,
  /\bsupabase\b/i,
  /\bfly\.io\b/i,
  /\brailway\b/i,
  /\bnetlify\b/i,
  /\bterraform\b/i,
];

function createFinding(
  code: string,
  severity: FindingSeverity,
  source: FindingSource,
  message: string,
): BuilderVerificationFinding {
  return { code, severity, source, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean);
}

function normalizeCostRange(value: unknown): { min: number; max: number } {
  if (!isRecord(value)) return { min: 0, max: 0 };
  const min = Math.max(0, asNumber(value.min));
  const max = Math.max(0, asNumber(value.max));

  if (min <= max) {
    return { min, max };
  }

  return { min: max, max: min };
}

function buildEmptyArchitecture(): SystemArchitecture {
  return {
    classification: "monolith",
    summary: "",
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

function normalizeResource(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchResource | null {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `resource_invalid_${index + 1}`,
        "warning",
        "schema",
        `Resource #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  const category = RESOURCE_CATEGORIES.has(value.category as ArchResource["category"])
    ? (value.category as ArchResource["category"])
    : "other";
  const tier = RESOURCE_TIERS.has(value.tier as ArchResource["tier"])
    ? (value.tier as ArchResource["tier"])
    : "recommended";

  if (category === "other" && asString(value.category)) {
    findings.push(
      createFinding(
        `resource_category_unknown_${index + 1}`,
        "warning",
        "schema",
        `Resource "${asString(value.name) || `#${index + 1}`}" used an unknown category and was normalized to "other".`,
      ),
    );
  }

  if (tier === "recommended" && asString(value.tier) && value.tier !== "recommended") {
    findings.push(
      createFinding(
        `resource_tier_unknown_${index + 1}`,
        "warning",
        "schema",
        `Resource "${asString(value.name) || `#${index + 1}`}" used an unknown tier and was normalized to "recommended".`,
      ),
    );
  }

  return {
    id: asString(value.id),
    name: asString(value.name),
    category,
    technology: asString(value.technology),
    purpose: asString(value.purpose),
    tier,
    scalingStrategy: asString(value.scalingStrategy),
    estimatedMonthlyCostUsd: normalizeCostRange(value.estimatedMonthlyCostUsd),
    notes: asString(value.notes),
  };
}

function normalizeDataFlow(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchDataFlow | null {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `data_flow_invalid_${index + 1}`,
        "warning",
        "schema",
        `Data flow #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  return {
    from: asString(value.from),
    to: asString(value.to),
    protocol: asString(value.protocol),
    description: asString(value.description),
    dataType: asString(value.dataType),
    async: asBoolean(value.async),
  };
}

function normalizeEnvironment(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchEnvironment | null {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `environment_invalid_${index + 1}`,
        "warning",
        "schema",
        `Environment #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  return {
    name: asString(value.name),
    purpose: asString(value.purpose),
    resources: asStringArray(value.resources),
    estimatedMonthlyCostUsd: normalizeCostRange(value.estimatedMonthlyCostUsd),
  };
}

function normalizeSecurityBoundary(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchSecurityBoundary | null {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `security_boundary_invalid_${index + 1}`,
        "warning",
        "schema",
        `Security boundary #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  return {
    name: asString(value.name),
    scope: asString(value.scope),
    controls: asStringArray(value.controls),
    threats: asStringArray(value.threats),
  };
}

function normalizeFailureMode(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchFailureMode | null {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `failure_mode_invalid_${index + 1}`,
        "warning",
        "schema",
        `Failure mode #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  return {
    component: asString(value.component),
    failureScenario: asString(value.failureScenario),
    impact: asString(value.impact),
    mitigationStrategy: asString(value.mitigationStrategy),
    rto: asString(value.rto),
    rpo: asString(value.rpo),
  };
}

function normalizeCostBreakdown(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchCostBreakdown | null {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `cost_breakdown_invalid_${index + 1}`,
        "warning",
        "schema",
        `Cost breakdown line #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  return {
    category: asString(value.category),
    items: asStringArray(value.items),
    estimatedMonthlyCostUsd: normalizeCostRange(value.estimatedMonthlyCostUsd),
  };
}

function normalizeMilestone(
  value: unknown,
  index: number,
  findings: BuilderVerificationFinding[],
): ArchMilestone | null {
  if (typeof value === "string") {
    findings.push(
      createFinding(
        `development_phase_string_${index + 1}`,
        "warning",
        "schema",
        `Development phase #${index + 1} was returned as plain text and was normalized into a milestone.`,
      ),
    );

    return {
      phase: index + 1,
      name: value.trim(),
      deliverables: [],
      estimatedWeeks: 0,
      dependencies: [],
    };
  }

  if (!isRecord(value)) {
    findings.push(
      createFinding(
        `development_phase_invalid_${index + 1}`,
        "warning",
        "schema",
        `Development phase #${index + 1} is not an object and was ignored.`,
      ),
    );
    return null;
  }

  return {
    phase: Math.max(1, Math.trunc(asNumber(value.phase) || index + 1)),
    name: asString(value.name),
    deliverables: asStringArray(value.deliverables),
    estimatedWeeks: Math.max(0, asNumber(value.estimatedWeeks)),
    dependencies: asStringArray(value.dependencies),
  };
}

function normalizeArchitecture(
  value: unknown,
  findings: BuilderVerificationFinding[],
): SystemArchitecture {
  if (!isRecord(value)) {
    findings.push(
      createFinding(
        "architecture_invalid_shape",
        "critical",
        "schema",
        "Architecture payload was not an object. A fallback empty architecture was used.",
      ),
    );
    return buildEmptyArchitecture();
  }

  const classification = CLASSIFICATIONS.includes(value.classification as SystemClassification)
    ? (value.classification as SystemClassification)
    : "monolith";

  if (classification === "monolith" && asString(value.classification) && value.classification !== "monolith") {
    findings.push(
      createFinding(
        "architecture_classification_unknown",
        "warning",
        "schema",
        `Unknown architecture classification "${asString(value.classification)}" was normalized to "monolith".`,
      ),
    );
  }

  const resources = Array.isArray(value.resources)
    ? value.resources
        .map((item, index) => normalizeResource(item, index, findings))
        .filter((item): item is ArchResource => Boolean(item))
    : [];

  const dataFlows = Array.isArray(value.dataFlows)
    ? value.dataFlows
        .map((item, index) => normalizeDataFlow(item, index, findings))
        .filter((item): item is ArchDataFlow => Boolean(item))
    : [];

  const environments = Array.isArray(value.environments)
    ? value.environments
        .map((item, index) => normalizeEnvironment(item, index, findings))
        .filter((item): item is ArchEnvironment => Boolean(item))
    : [];

  const securityBoundaries = Array.isArray(value.securityBoundaries)
    ? value.securityBoundaries
        .map((item, index) => normalizeSecurityBoundary(item, index, findings))
        .filter((item): item is ArchSecurityBoundary => Boolean(item))
    : [];

  const failureModes = Array.isArray(value.failureModes)
    ? value.failureModes
        .map((item, index) => normalizeFailureMode(item, index, findings))
        .filter((item): item is ArchFailureMode => Boolean(item))
    : [];

  const costBreakdown = Array.isArray(value.costBreakdown)
    ? value.costBreakdown
        .map((item, index) => normalizeCostBreakdown(item, index, findings))
        .filter((item): item is ArchCostBreakdown => Boolean(item))
    : [];

  return {
    classification,
    summary: asString(value.summary),
    principles: asStringArray(value.principles),
    resources,
    dataFlows,
    environments,
    securityBoundaries,
    failureModes,
    costBreakdown,
    totalEstimatedMonthlyCostUsd: normalizeCostRange(value.totalEstimatedMonthlyCostUsd),
    scalingNotes: asString(value.scalingNotes),
    tradeoffs: asStringArray(value.tradeoffs),
  };
}

export function normalizeBuilderPayload(raw: unknown): NormalizationResult {
  const findings: BuilderVerificationFinding[] = [];

  if (!isRecord(raw)) {
    findings.push(
      createFinding(
        "builder_payload_invalid_shape",
        "critical",
        "schema",
        "Builder output was not a JSON object. A fallback payload was produced.",
      ),
    );

    return {
      payload: {
        requestUnderstanding: "",
        assumptions: [],
        recommendedScope: "",
        architecture: buildEmptyArchitecture(),
        developmentPlan: [],
        devopsPlan: [],
        businessNotes: [],
        competitiveAssessment: "",
        warnings: [],
        nextSteps: [],
      },
      findings,
    };
  }

  const developmentPlan = Array.isArray(raw.developmentPlan)
    ? raw.developmentPlan
        .map((item, index) => normalizeMilestone(item, index, findings))
        .filter((item): item is ArchMilestone => Boolean(item))
    : [];

  return {
    payload: {
      requestUnderstanding: asString(raw.requestUnderstanding),
      assumptions: asStringArray(raw.assumptions),
      recommendedScope: asString(raw.recommendedScope),
      architecture: normalizeArchitecture(raw.architecture, findings),
      developmentPlan,
      devopsPlan: asStringArray(raw.devopsPlan),
      businessNotes: asStringArray(raw.businessNotes),
      competitiveAssessment: asString(raw.competitiveAssessment),
      warnings: asStringArray(raw.warnings),
      nextSteps: asStringArray(raw.nextSteps),
    },
    findings,
  };
}

function pushRuleFinding(
  findings: BuilderVerificationFinding[],
  code: string,
  severity: FindingSeverity,
  message: string,
): void {
  findings.push(createFinding(code, severity, "rule", message));
}

function computePromptSpecificity(prompt: string): BenchmarkSignals["promptSpecificity"] {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (words < 12) return "low";
  if (words < 35) return "medium";
  return "high";
}

function calculateRecognizedTechCoverage(resources: ArchResource[]): number {
  if (resources.length === 0) return 0;
  const recognized = resources.filter((resource) =>
    KNOWN_TECH_PATTERNS.some((pattern) => pattern.test(resource.technology)),
  ).length;
  return recognized / resources.length;
}

function evaluateRuleChecks(
  prompt: string,
  payload: BuilderLLMPayload,
): RuleEvaluationResult {
  const findings: BuilderVerificationFinding[] = [];
  let checksRun = 0;
  let costAligned = true;
  let timelineAligned = true;

  const architecture = payload.architecture;
  const resources = architecture.resources;
  const resourceIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const totalCost = architecture.totalEstimatedMonthlyCostUsd;
  const environments = architecture.environments;
  const failureModes = architecture.failureModes;
  const hasComplexClassification = COMPLEX_CLASSIFICATIONS.has(architecture.classification);
  const promptSpecificity = computePromptSpecificity(prompt);
  const recognizedTechCoverage = calculateRecognizedTechCoverage(resources);

  checksRun += 1;
  if (resources.length === 0) {
    pushRuleFinding(findings, "resource_list_empty", "critical", "Architecture lists no concrete resources.");
  }

  checksRun += 1;
  if (!architecture.summary) {
    pushRuleFinding(findings, "architecture_summary_missing", "warning", "Architecture summary is empty.");
  }

  for (const resource of resources) {
    checksRun += 1;
    if (!resource.id) {
      pushRuleFinding(
        findings,
        "resource_missing_id",
        "critical",
        `Resource "${resource.name || resource.technology || "unnamed"}" is missing an id.`,
      );
      continue;
    }

    if (resourceIds.has(resource.id)) {
      duplicateIds.add(resource.id);
    }
    resourceIds.add(resource.id);
  }

  if (duplicateIds.size > 0) {
    pushRuleFinding(
      findings,
      "resource_ids_not_unique",
      "critical",
      `Resource ids must be unique. Duplicate ids found: ${Array.from(duplicateIds).join(", ")}.`,
    );
  }

  checksRun += 1;
  if (hasComplexClassification && architecture.dataFlows.length === 0) {
    pushRuleFinding(
      findings,
      "data_flows_missing",
      "warning",
      "Complex architecture has no documented data flows.",
    );
  }

  checksRun += 1;
  if (hasComplexClassification && environments.length === 0) {
    pushRuleFinding(
      findings,
      "environments_missing",
      "warning",
      "Complex architecture has no explicit environments.",
    );
  }

  checksRun += 1;
  if (hasComplexClassification && failureModes.length === 0) {
    pushRuleFinding(
      findings,
      "failure_modes_missing",
      "warning",
      "Complex architecture has no failure modes, so resilience claims are not verifiable.",
    );
  }

  for (const flow of architecture.dataFlows) {
    checksRun += 1;
    if (flow.to && !resourceIds.has(flow.to)) {
      pushRuleFinding(
        findings,
        "data_flow_unknown_target",
        "critical",
        `Data flow target "${flow.to}" does not match any resource id.`,
      );
    }
  }

  for (const env of environments) {
    for (const resourceId of env.resources) {
      checksRun += 1;
      if (!resourceIds.has(resourceId)) {
        pushRuleFinding(
          findings,
          "environment_unknown_resource",
          "critical",
          `Environment "${env.name || "unnamed"}" references unknown resource "${resourceId}".`,
        );
      }
    }
  }

  for (const failureMode of failureModes) {
    checksRun += 1;
    if (failureMode.component && !resourceIds.has(failureMode.component)) {
      pushRuleFinding(
        findings,
        "failure_mode_unknown_component",
        "critical",
        `Failure mode references unknown component "${failureMode.component}".`,
      );
    }
  }

  const maxSingleResourceCost = resources.reduce(
    (max, resource) => Math.max(max, resource.estimatedMonthlyCostUsd.max),
    0,
  );
  const maxEnvironmentCost = environments.reduce(
    (max, env) => Math.max(max, env.estimatedMonthlyCostUsd.max),
    0,
  );
  const essentialAndRecommendedResources = resources.filter((resource) => resource.tier !== "optional");
  const summedResourceCostMax = essentialAndRecommendedResources.reduce(
    (sum, resource) => sum + resource.estimatedMonthlyCostUsd.max,
    0,
  );

  checksRun += 1;
  if (resources.length > 0 && totalCost.max === 0) {
    pushRuleFinding(
      findings,
      "total_cost_zero_with_resources",
      "critical",
      "Total monthly cost is zero even though billable resources were listed.",
    );
  }

  checksRun += 1;
  if (totalCost.max > 0 && totalCost.max < maxSingleResourceCost) {
    pushRuleFinding(
      findings,
      "total_cost_below_resource_max",
      "critical",
      "Total monthly cost is lower than the most expensive individual resource.",
    );
  }

  checksRun += 1;
  if (totalCost.max > 0 && totalCost.max < maxEnvironmentCost) {
    pushRuleFinding(
      findings,
      "total_cost_below_environment_max",
      "critical",
      "Total monthly cost is lower than the most expensive listed environment.",
    );
  }

  checksRun += 1;
  if (summedResourceCostMax > 0 && totalCost.max > 0 && totalCost.max < summedResourceCostMax * 0.35) {
    pushRuleFinding(
      findings,
      "total_cost_far_below_resource_sum",
      "warning",
      "Total monthly cost is far below the combined cost of essential and recommended resources.",
    );
  }

  const costBenchmark = COST_BENCHMARKS[architecture.classification];
  checksRun += 1;
  if (totalCost.max > 0 && totalCost.max < costBenchmark.min * 0.5) {
    costAligned = false;
    pushRuleFinding(
      findings,
      "cost_benchmark_outlier_low",
      "warning",
      `Estimated monthly cost looks too low for a ${architecture.classification.replace(/_/g, " ")}. Expected roughly $${costBenchmark.min}-${costBenchmark.max}/mo.`,
    );
  } else if (totalCost.max > costBenchmark.max * 2.5) {
    costAligned = false;
    pushRuleFinding(
      findings,
      "cost_benchmark_outlier_high",
      "warning",
      `Estimated monthly cost looks high for a ${architecture.classification.replace(/_/g, " ")}. Expected roughly $${costBenchmark.min}-${costBenchmark.max}/mo unless unusually large scale is required.`,
    );
  }

  const totalWeeks = payload.developmentPlan.reduce((sum, phase) => sum + phase.estimatedWeeks, 0);
  const timelineBenchmark = TIMELINE_BENCHMARKS[architecture.classification];

  checksRun += 1;
  if (payload.developmentPlan.length > 0 && totalWeeks === 0) {
    timelineAligned = false;
    pushRuleFinding(
      findings,
      "timeline_missing_week_estimates",
      "warning",
      "Development plan exists, but every milestone has zero estimated weeks.",
    );
  } else if (totalWeeks > 0 && totalWeeks < timelineBenchmark.min * 0.5) {
    timelineAligned = false;
    pushRuleFinding(
      findings,
      "timeline_benchmark_outlier_low",
      "warning",
      `Development timeline looks too short for a ${architecture.classification.replace(/_/g, " ")}. Expected roughly ${timelineBenchmark.min}-${timelineBenchmark.max} weeks.`,
    );
  } else if (totalWeeks > timelineBenchmark.max * 2) {
    timelineAligned = false;
    pushRuleFinding(
      findings,
      "timeline_benchmark_outlier_high",
      "warning",
      `Development timeline looks very long for a ${architecture.classification.replace(/_/g, " ")}. Expected roughly ${timelineBenchmark.min}-${timelineBenchmark.max} weeks.`,
    );
  }

  checksRun += 1;
  if (resources.length >= 8 && totalWeeks > 0 && totalWeeks < 4) {
    timelineAligned = false;
    pushRuleFinding(
      findings,
      "timeline_too_short_for_resource_count",
      "warning",
      "Resource count is high for the proposed implementation timeline.",
    );
  }

  const technologyText = resources.map((resource) => resource.technology).join(" ");
  const notesAndSummary = [
    architecture.summary,
    architecture.scalingNotes,
    ...resources.map((resource) => resource.notes),
    ...resources.map((resource) => resource.purpose),
  ].join(" ");
  const hasPrisma = /\bprisma\b/i.test(technologyText);
  const hasDynamoDb = /\bdynamo\s*db\b/i.test(technologyText);
  const hasServerlessRuntime =
    architecture.classification === "serverless" ||
    /\b(serverless|lambda|vercel functions|netlify functions|cloud functions)\b/i.test(technologyText);
  const hasNextJs = /\bnext\.?js\b/i.test(technologyText);
  const hasWebSockets =
    architecture.dataFlows.some((flow) => /websocket/i.test(flow.protocol)) ||
    /\bwebsocket\b/i.test(notesAndSummary);
  const hasEventInfrastructure = resources.some((resource) =>
    resource.category === "queue" || resource.category === "event_bus",
  );
  const hasDatabase = resources.some((resource) => resource.category === "database");
  const hasMonitoring = resources.some((resource) =>
    resource.category === "monitoring" || resource.category === "logging",
  );
  const hasLoadDistribution = resources.some((resource) =>
    resource.category === "load_balancer" ||
    resource.category === "cdn" ||
    resource.category === "dns" ||
    resource.category === "api_gateway",
  );
  const claimsMultiRegion = /\bmulti[- ]region\b|\bglobal\b/i.test(notesAndSummary);

  checksRun += 1;
  if (hasPrisma && hasDynamoDb) {
    pushRuleFinding(
      findings,
      "prisma_dynamodb_incompatibility",
      "critical",
      "Prisma and DynamoDB are not a supported primary pairing for a standard production architecture.",
    );
  }

  checksRun += 1;
  if (hasNextJs && hasServerlessRuntime && hasWebSockets) {
    pushRuleFinding(
      findings,
      "serverless_websocket_mismatch",
      "warning",
      "Next.js on a serverless runtime plus native WebSockets is a risky deployment assumption and usually needs a separate realtime service.",
    );
  }

  checksRun += 1;
  if (architecture.classification === "event_driven" && !hasEventInfrastructure) {
    pushRuleFinding(
      findings,
      "event_driven_without_event_bus",
      "critical",
      "Event-driven architecture was selected, but no queue or event bus resource is present.",
    );
  }

  checksRun += 1;
  if (hasComplexClassification && hasDatabase && !failureModes.some((mode) => mode.component && resourceIds.has(mode.component))) {
    pushRuleFinding(
      findings,
      "database_without_failure_mode",
      "warning",
      "A database is present, but the plan does not describe any recoverability scenario tied to a concrete component.",
    );
  }

  checksRun += 1;
  if (hasComplexClassification && hasDatabase && !hasMonitoring) {
    pushRuleFinding(
      findings,
      "monitoring_missing_for_stateful_system",
      "warning",
      "Stateful architecture has no monitoring or logging resources, making operations hard to verify.",
    );
  }

  checksRun += 1;
  if (claimsMultiRegion && !hasLoadDistribution) {
    pushRuleFinding(
      findings,
      "multi_region_without_distribution_layer",
      "warning",
      "Architecture claims multi-region or global scale but lacks CDN, DNS, API gateway, or load-balancing components.",
    );
  }

  checksRun += 1;
  if (promptSpecificity === "low") {
    pushRuleFinding(
      findings,
      "prompt_low_specificity",
      "warning",
      "Prompt is vague, so architecture confidence should be treated as low unless verified manually.",
    );
  }

  return {
    findings,
    checksRun,
    signals: {
      costAligned,
      timelineAligned,
      recognizedTechCoverage,
      promptSpecificity,
    },
  };
}

function dedupeFindings(findings: BuilderVerificationFinding[]): BuilderVerificationFinding[] {
  const deduped = new Map<string, BuilderVerificationFinding>();

  for (const finding of findings) {
    const key = finding.message.trim().toLowerCase();
    if (!key) continue;

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, finding);
      continue;
    }

    const severityRank: Record<FindingSeverity, number> = {
      info: 0,
      warning: 1,
      critical: 2,
    };

    if (severityRank[finding.severity] > severityRank[existing.severity]) {
      deduped.set(key, finding);
    }
  }

  return Array.from(deduped.values());
}

function calculateConfidence(
  estimate: BuilderCostEstimate,
  findings: BuilderVerificationFinding[],
  signals: BenchmarkSignals,
): BuilderVerificationSummary["confidence"] {
  const severityBase: Record<BuilderCostEstimate["confidence"], number> = {
    low: 1,
    medium: 3,
    high: 5,
  };

  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const schemaCount = findings.filter((finding) => finding.source === "schema").length;

  let score = severityBase[estimate.confidence];

  if (signals.promptSpecificity === "high") score += 1;
  if (signals.recognizedTechCoverage >= 0.6) score += 1;
  if (signals.costAligned) score += 1;
  if (signals.timelineAligned) score += 1;

  score -= criticalCount * 2;
  score -= Math.min(2, warningCount);

  if (schemaCount > 0) score -= 1;
  if (signals.promptSpecificity === "low") score -= 1;

  if (score <= 2) return "low";
  if (score <= 5) return "medium";
  return "high";
}

export function buildBuilderVerification(args: {
  prompt: string;
  estimate: BuilderCostEstimate;
  payload: BuilderLLMPayload;
  schemaFindings?: BuilderVerificationFinding[];
  auditFindings?: BuilderVerificationFinding[];
}): BuilderVerificationSummary {
  const ruleEvaluation = evaluateRuleChecks(args.prompt, args.payload);
  const findings = dedupeFindings([
    ...(args.schemaFindings ?? []),
    ...ruleEvaluation.findings,
    ...(args.auditFindings ?? []),
  ]);

  const criticalFindings = findings.filter((finding) => finding.severity === "critical").length;
  const warningFindings = findings.filter((finding) => finding.severity === "warning").length;
  const auditFindings = findings.filter((finding) => finding.source === "audit").length;
  const confidence = calculateConfidence(args.estimate, findings, ruleEvaluation.signals);

  return {
    status:
      criticalFindings > 0
        ? "failed"
        : warningFindings > 0
          ? "passed_with_warnings"
          : "passed",
    confidence,
    findings,
    metrics: {
      totalChecks: ruleEvaluation.checksRun,
      flaggedChecks: findings.length,
      criticalFindings,
      warningFindings,
      auditFindings,
    },
  };
}

export function formatVerificationWarnings(
  verification?: BuilderVerificationSummary,
): string[] {
  if (!verification) return [];

  return verification.findings
    .filter((finding) => finding.severity !== "info")
    .map((finding) => {
      const sourceLabel =
        finding.source === "audit"
          ? "Audit"
          : finding.source === "schema"
            ? "Schema validation"
            : "Architecture validation";

      return `${sourceLabel} (${finding.severity}): ${finding.message}`;
    });
}
