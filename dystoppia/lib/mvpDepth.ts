export type DepthTier =
  | "routine"
  | "professional"
  | "advanced"
  | "mission_critical";

export interface DepthConstraints {
  debateMin: number;
  featuresMin: number;
  risksMin: number;
  phasesMin: number;
  decisionsMin: number;
  assumptionsMin: number;
  legalMin: number;
  servicesMin: number;
  stackMin: number;
  nextActionsMin: number;
}

export interface DepthAssessment {
  tier: DepthTier;
  score: number;
  reasons: string[];
  constraints: DepthConstraints;
  flags: {
    automationRiskLikely: boolean;
    enterpriseOrCriticalLikely: boolean;
  };
}

export interface PersonaSignal {
  id: string;
  name: string;
  reason: string;
}

const DEPTH_CONSTRAINTS: Record<DepthTier, DepthConstraints> = {
  routine: {
    debateMin: 4,
    featuresMin: 3,
    risksMin: 3,
    phasesMin: 2,
    decisionsMin: 2,
    assumptionsMin: 3,
    legalMin: 1,
    servicesMin: 2,
    stackMin: 2,
    nextActionsMin: 2,
  },
  professional: {
    debateMin: 6,
    featuresMin: 5,
    risksMin: 5,
    phasesMin: 3,
    decisionsMin: 4,
    assumptionsMin: 4,
    legalMin: 2,
    servicesMin: 3,
    stackMin: 3,
    nextActionsMin: 3,
  },
  advanced: {
    debateMin: 8,
    featuresMin: 7,
    risksMin: 7,
    phasesMin: 4,
    decisionsMin: 6,
    assumptionsMin: 6,
    legalMin: 4,
    servicesMin: 4,
    stackMin: 4,
    nextActionsMin: 4,
  },
  mission_critical: {
    debateMin: 10,
    featuresMin: 9,
    risksMin: 9,
    phasesMin: 5,
    decisionsMin: 8,
    assumptionsMin: 8,
    legalMin: 5,
    servicesMin: 5,
    stackMin: 5,
    nextActionsMin: 5,
  },
};

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasQuantitySignal(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return (
    /\d/.test(text) ||
    /\$|usd|eur|brl|month|monthly|week|weekly|day|daily|year|annual|qps|rps|tps|ms|sec|min|hour|tenant|user|request|throughput|latency|uptime|sla|slo|rto|rpo|%/i.test(
      text
    )
  );
}

const ROUTINE_HINTS = [
  /\bblog\b/i,
  /\bportfolio\b/i,
  /\blanding page\b/i,
  /\bpersonal site\b/i,
  /\bsmall app\b/i,
  /\bto[- ]?do\b/i,
  /\bpet project\b/i,
];

const PROFESSIONAL_HINTS = [
  /\bb2b\b/i,
  /\bsaas\b/i,
  /\bworkflow\b/i,
  /\bintegration\b/i,
  /\banalytics\b/i,
  /\bdashboard\b/i,
  /\bapi\b/i,
];

const ADVANCED_HINTS = [
  /\benterprise\b/i,
  /\brobust\b/i,
  /\bhigh[- ]?end\b/i,
  /\bhigh availability\b/i,
  /\bdistributed\b/i,
  /\bmulti[- ]?tenant\b/i,
  /\breal[- ]?time\b/i,
  /\bobservability\b/i,
  /\bgovernance\b/i,
  /\bscalability\b/i,
  /\bthroughput\b/i,
];

const CRITICAL_HINTS = [
  /\bhealthcare\b/i,
  /\bbanking\b/i,
  /\bfinancial services\b/i,
  /\bpayments?\b/i,
  /\bcritical infrastructure\b/i,
  /\bdefen[cs]e\b/i,
  /\bregulated\b/i,
  /\bgdpr\b/i,
  /\bhipaa\b/i,
  /\bsox\b/i,
  /\bpci[- ]?dss\b/i,
  /\bpii\b/i,
];

const AUTOMATION_RISK_HINTS = [
  /\bscrap(e|ing)\b/i,
  /\bcrawl(er|ing)?\b/i,
  /\bautomati[sz]e\b/i,
  /\bbot\b/i,
  /\brate limit\b/i,
  /\bthrottle\b/i,
  /\bblock(ed|ing)?\b/i,
  /\breputation\b/i,
  /\bdetection\b/i,
  /\banti[- ]?bot\b/i,
  /\bip\b/i,
];

export function assessDepthForMvp(params: {
  originalPrompt: string;
  projectSummary: string;
  qaHistoryText: string;
  personas: PersonaSignal[];
}): DepthAssessment {
  // Use the original prompt as the PRIMARY signal source — it reflects
  // what the user actually asked for. The derived corpus (project summary,
  // QA history, personas) is produced by the LLM and often inflates
  // language (e.g. "enterprise-grade", "distributed", "scalability")
  // beyond the user's actual intent.
  const userText = params.originalPrompt;
  const derivedCorpus = [
    params.projectSummary,
    params.qaHistoryText,
    params.personas.map((p) => `${p.id} ${p.name} ${p.reason}`).join(" "),
  ]
    .join("\n")
    .trim();
  const corpus = `${userText}\n${derivedCorpus}`;

  const reasons: string[] = [];
  let score = 0;

  if (userText.length > 180) {
    score += 1;
    reasons.push("Prompt has non-trivial scope.");
  }
  if (userText.length > 500) {
    score += 2;
    reasons.push("Prompt is large and likely multi-dimensional.");
  }
  if (userText.length > 1200) {
    score += 2;
    reasons.push("Prompt is very broad.");
  }

  if (params.personas.length >= 6) {
    score += 1;
    reasons.push("Many specialist personas required.");
  }
  if (params.qaHistoryText.split("\n\n").length >= 5) {
    score += 1;
    reasons.push("Substantial clarification history already exists.");
  }

  // Professional hints: check both user text and derived corpus
  if (hasAny(corpus, PROFESSIONAL_HINTS)) {
    score += 2;
    reasons.push("Professional system indicators found.");
  }
  // Advanced/critical hints: full weight ONLY if found in the user's
  // original prompt. If only the LLM-generated summary uses these words,
  // apply reduced weight (+1 instead of +3/+4) to avoid score inflation.
  if (hasAny(userText, ADVANCED_HINTS)) {
    score += 3;
    reasons.push("Advanced architecture/reliability indicators found in user prompt.");
  } else if (hasAny(derivedCorpus, ADVANCED_HINTS)) {
    score += 1;
    reasons.push("Advanced indicators found in derived context (reduced weight).");
  }
  if (hasAny(userText, CRITICAL_HINTS)) {
    score += 4;
    reasons.push("Regulated or critical-domain indicators found in user prompt.");
  } else if (hasAny(derivedCorpus, CRITICAL_HINTS)) {
    score += 1;
    reasons.push("Critical-domain indicators found in derived context (reduced weight).");
  }
  if (hasAny(corpus, AUTOMATION_RISK_HINTS)) {
    score += 2;
    reasons.push("Automation/platform abuse risk indicators found.");
  }

  if (hasAny(corpus, ROUTINE_HINTS) && score < 4) {
    score = Math.max(0, score - 1);
    reasons.push("Routine product signals detected.");
  }

  let tier: DepthTier = "routine";
  if (score >= 11) tier = "mission_critical";
  else if (score >= 7) tier = "advanced";
  else if (score >= 3) tier = "professional";

  // Only escalate to "advanced" if the USER explicitly asked for
  // enterprise/high-end, not if the LLM summary used those words.
  if (
    /\bhigh[- ]?end azure\b/i.test(userText) ||
    /\benterprise[- ]grade\b/i.test(userText)
  ) {
    if (tier === "routine" || tier === "professional") {
      tier = "advanced";
      reasons.push("Explicit enterprise/high-end requirement detected in user prompt.");
    }
  }

  const automationRiskLikely = hasAny(corpus, AUTOMATION_RISK_HINTS);
  const enterpriseOrCriticalLikely =
    hasAny(userText, ADVANCED_HINTS) ||
    hasAny(userText, CRITICAL_HINTS) ||
    /\bhigh[- ]?end azure\b/i.test(userText) ||
    /\benterprise[- ]grade\b/i.test(userText);

  return {
    tier,
    score,
    reasons: reasons.length > 0 ? reasons : ["Defaulted to routine depth."],
    constraints: DEPTH_CONSTRAINTS[tier],
    flags: {
      automationRiskLikely,
      enterpriseOrCriticalLikely,
    },
  };
}

export function buildDepthGuidance(assessment: DepthAssessment): string {
  const constraints = assessment.constraints;
  return [
    `Depth tier: ${assessment.tier} (score ${assessment.score}).`,
    `Signals: ${assessment.reasons.join(" ")}`,
    "Depth rules:",
    `- refinedDebate must have at least ${constraints.debateMin} messages.`,
    `- If readyForMvp=true, include at least: ${constraints.featuresMin} core features, ${constraints.risksMin} risks, ${constraints.phasesMin} phases, and ${constraints.decisionsMin} detailed architecture/product decisions.`,
    `- If readyForMvp=true, architecture must include at least ${constraints.stackMin} stack items and ${constraints.servicesMin} services.`,
    `- If readyForMvp=true, include at least ${constraints.assumptionsMin} estimate assumptions, ${constraints.legalMin} legal considerations, and ${constraints.nextActionsMin} next actions.`,
    "- Definition of Ready hard gate: costs, timeline, and risks must be explicit and measurable (not vague).",
    "- Every detailed decision must include rationale, alternatives considered, and explicit cost/timeline/risk impact.",
    "- Use concrete methods/frameworks and explicit tradeoffs; avoid generic filler.",
    "- Requests classified as advanced/mission_critical require production-grade reliability and governance details.",
  ].join("\n");
}

export function findDepthGaps(
  parsed: Record<string, unknown>,
  assessment: DepthAssessment
): string[] {
  const gaps: string[] = [];
  const constraints = assessment.constraints;

  const refinedDebate = asArray(parsed.refinedDebate);
  if (refinedDebate.length < constraints.debateMin) {
    gaps.push(
      `refinedDebate has ${refinedDebate.length}, expected at least ${constraints.debateMin}`
    );
  }

  const readiness =
    parsed.readiness && typeof parsed.readiness === "object"
      ? (parsed.readiness as Record<string, unknown>)
      : {};
  const readyForMvp = readiness.readyForMvp === true;

  const nextActions = asArray(parsed.nextActions);
  if (nextActions.length < constraints.nextActionsMin) {
    gaps.push(
      `nextActions has ${nextActions.length}, expected at least ${constraints.nextActionsMin}`
    );
  }

  if (!readyForMvp) return gaps;

  const proposal =
    parsed.mvpProposal && typeof parsed.mvpProposal === "object"
      ? (parsed.mvpProposal as Record<string, unknown>)
      : null;
  if (!proposal) {
    gaps.push("readyForMvp=true but mvpProposal is null/invalid");
    return gaps;
  }

  const coreFeatures = asArray(proposal.coreFeatures);
  const risks = asArray(proposal.risks);
  const phases = asArray(proposal.phases);
  const decisionLog = asArray(proposal.decisionLog);
  const outOfScope = asArray(proposal.outOfScope);
  const estimateAssumptions = asArray(proposal.estimateAssumptions);
  const legal = asArray(proposal.legalConsiderations);

  const architecture =
    proposal.architecture && typeof proposal.architecture === "object"
      ? (proposal.architecture as Record<string, unknown>)
      : {};
  const stack = asArray(architecture.stack);
  const services = asArray(architecture.services);
  const businessModel = asTrimmedString(proposal.businessModel);
  const teamRecommendation = asTrimmedString(proposal.teamRecommendation);
  const estimatedEffort = asTrimmedString(proposal.estimatedEffort);
  const estimatedBuildCostUSD = asTrimmedString(proposal.estimatedBuildCostUSD);
  const estimatedMonthlyCostUSD = asTrimmedString(
    proposal.estimatedMonthlyCostUSD
  );
  const architectureSummary = asTrimmedString(architecture.summary);

  if (coreFeatures.length < constraints.featuresMin) {
    gaps.push(
      `coreFeatures has ${coreFeatures.length}, expected at least ${constraints.featuresMin}`
    );
  }
  if (risks.length < constraints.risksMin) {
    gaps.push(`risks has ${risks.length}, expected at least ${constraints.risksMin}`);
  }
  if (phases.length < constraints.phasesMin) {
    gaps.push(`phases has ${phases.length}, expected at least ${constraints.phasesMin}`);
  }
  if (decisionLog.length < constraints.decisionsMin) {
    gaps.push(
      `decisionLog has ${decisionLog.length}, expected at least ${constraints.decisionsMin}`
    );
  }
  if (estimateAssumptions.length < constraints.assumptionsMin) {
    gaps.push(
      `estimateAssumptions has ${estimateAssumptions.length}, expected at least ${constraints.assumptionsMin}`
    );
  }
  if (legal.length < constraints.legalMin) {
    gaps.push(
      `legalConsiderations has ${legal.length}, expected at least ${constraints.legalMin}`
    );
  }
  if (stack.length < constraints.stackMin) {
    gaps.push(`architecture.stack has ${stack.length}, expected at least ${constraints.stackMin}`);
  }
  if (services.length < constraints.servicesMin) {
    gaps.push(
      `architecture.services has ${services.length}, expected at least ${constraints.servicesMin}`
    );
  }

  if (!architectureSummary) {
    gaps.push("architecture.summary is empty");
  }
  if (!estimatedEffort) {
    gaps.push("estimatedEffort is empty");
  }
  if (!estimatedBuildCostUSD) {
    gaps.push("estimatedBuildCostUSD is empty");
  }
  if (!estimatedMonthlyCostUSD) {
    gaps.push("estimatedMonthlyCostUSD is empty");
  }
  if (!businessModel) {
    gaps.push("businessModel is empty");
  }
  if (!teamRecommendation) {
    gaps.push("teamRecommendation is empty");
  }

  if (!hasQuantitySignal(estimatedEffort)) {
    gaps.push("estimatedEffort lacks measurable timeline units");
  }
  if (!hasQuantitySignal(estimatedBuildCostUSD)) {
    gaps.push("estimatedBuildCostUSD lacks measurable budget details");
  }
  if (!hasQuantitySignal(estimatedMonthlyCostUSD)) {
    gaps.push("estimatedMonthlyCostUSD lacks measurable operating cost details");
  }

  const detailedDecisions = decisionLog.filter((item) => {
    const row = asRecord(item);
    const title = asTrimmedString(row.title);
    const decision = asTrimmedString(row.decision);
    const rationale = asTrimmedString(row.rationale);
    const alternatives = asArray(row.alternativesConsidered).filter(
      (value) => typeof value === "string" && value.trim().length > 0
    );
    const tradeoffs = asTrimmedString(row.tradeoffs);
    const costImpact = asTrimmedString(row.costImpact);
    const timelineImpact = asTrimmedString(row.timelineImpact);
    const riskImpact = asTrimmedString(row.riskImpact);

    return (
      title &&
      decision &&
      rationale &&
      alternatives.length >= 1 &&
      tradeoffs &&
      costImpact &&
      timelineImpact &&
      riskImpact
    );
  });

  if (detailedDecisions.length < constraints.decisionsMin) {
    gaps.push(
      `decisionLog has ${detailedDecisions.length} fully detailed entries, expected at least ${constraints.decisionsMin}`
    );
  }

  if (assessment.flags.enterpriseOrCriticalLikely && outOfScope.length < 3) {
    gaps.push("outOfScope is too shallow for advanced/critical scope");
  }

  if (assessment.flags.automationRiskLikely) {
    const riskCorpus = [
      ...risks.map((item) => JSON.stringify(item)),
      ...legal.map((item) => (typeof item === "string" ? item : "")),
      ...decisionLog.map((item) => JSON.stringify(item)),
    ]
      .join(" ")
      .toLowerCase();

    const hasRateLimitCoverage =
      /rate limit|throttl|quota|backoff|retry/i.test(riskCorpus);
    const hasBlockingCoverage =
      /block|suspend|ban|reputation|trust score|ip|credential/i.test(riskCorpus);
    const hasTosCoverage =
      /terms|tos|policy|compliance|legal|consent|platform/i.test(riskCorpus);

    if (!hasRateLimitCoverage) {
      gaps.push(
        "automation risk coverage missing: rate limiting/throttling strategy not explicit"
      );
    }
    if (!hasBlockingCoverage) {
      gaps.push(
        "automation risk coverage missing: blocking/suspension vectors not explicit"
      );
    }
    if (!hasTosCoverage) {
      gaps.push(
        "automation risk coverage missing: ToS/legal constraints not explicit"
      );
    }
  }

  return gaps;
}
