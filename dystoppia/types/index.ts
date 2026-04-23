export interface TeachingProfile {
  style: string;           // e.g. "scenario_based", "practical_procedural", "conceptual_narrative"
  register: string;        // e.g. "technical", "instructional", "conversational"
  questionPatterns: string[]; // sentence starters / templates for question generation
  contextHint: string;     // how to frame questions for this domain
  exampleDomain: string;   // concrete setting to draw examples from
  assessmentFocus: string; // what cognitive skill to test: recall, application, analysis, synthesis
}

export interface Topic {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  teachingProfile?: TeachingProfile | null;
  items: Item[];
}

export interface Item {
  id: string;
  topicId: string;
  name: string;
  order: number;
  muted: boolean;
  subItems: SubItem[];
}

export interface SubItem {
  id: string;
  itemId: string;
  name: string;
  order: number;
  muted: boolean;
  difficulty: number;
}

export interface Question {
  id: string;
  subItemId: string;
  type: "multiple_choice" | "single_choice" | "fill_blank" | "true_false";
  content: string;
  options?: string[] | null;
  answer: string;
  explanation: string;
  primer?: string | null;
  fact?: string | null;
  difficulty: number;
  timeLimit?: number | null;
  flaggedAt?: string | null;
  flaggedReason?: string | null;
  createdAt: string;
  subItem?: SubItem;
}

export interface UserAnswer {
  id: string;
  questionId: string;
  subItemId: string;
  sessionId: string;
  correct: boolean;
  timeSpent: number;
  createdAt: string;
}

export interface SubItemStats {
  correctCount: number;
  totalCount: number;
  difficulty: number;
  lastSeen?: string;
}

export interface Settings {
  queueDepth: number;
  refillTrigger: number;
  timerEnabled: boolean;
}

export type QuestionType = "multiple_choice" | "single_choice" | "fill_blank" | "true_false";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export interface SessionHistoryEntry {
  date: string;
  correctCount: number;
  totalCount: number;
  xpEarned: number;
  topicId: string;
}

// Onboarding types

export interface OnboardingCard {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface OnboardingTurn {
  question: string;
  subtitle?: string;
  multiSelect: boolean;
  cards: OnboardingCard[];
  allowFreeText: boolean;
  freeTextPlaceholder?: string;
}

export interface OnboardingMessage {
  role: "assistant" | "user";
  content: string;
  selectedCards?: string[];
}

export interface OnboardingSummary {
  topic: string;
  [key: string]: string | undefined;
}

export interface OnboardingChatResponse {
  turn: OnboardingTurn | null;
  summary: OnboardingSummary;
  readyToCreate: boolean;
  onboardingContext?: string;
}

export interface OnboardingEntry {
  topic: string;
  context: string;
  createdAt: string;
}

export interface UserProfile {
  goals: string[];
  knowledgeLevels: Record<string, string>;
  timePerSession?: string;
  preferredLang: string;
  rawHistory?: OnboardingEntry[];
}

export interface BuilderEstimate {
  complexity: "small" | "medium" | "large" | "unsafe_or_unknown";
  actionClass: "read_only" | "analysis_only" | "billable_generation" | "privileged_execution";
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  providerCostUsd: number;
  overheadUsd: number;
  safetyBufferUsd: number;
  totalCostUsd: number;
  estimatedCredits: number;
  viabilityStatus: "approved" | "approved_with_warning" | "reduce_scope" | "reject";
  confidence: "low" | "medium" | "high";
  reasons: string[];
}

// ── Architecture specification types ──

export type SystemClassification =
  | "static_site"
  | "single_page_app"
  | "server_rendered_app"
  | "monolith"
  | "modular_monolith"
  | "client_server"
  | "microservices"
  | "event_driven"
  | "serverless"
  | "data_pipeline"
  | "ml_platform"
  | "hybrid";

export type ResourceCategory =
  | "compute"
  | "database"
  | "cache"
  | "queue"
  | "storage"
  | "cdn"
  | "dns"
  | "load_balancer"
  | "api_gateway"
  | "auth"
  | "monitoring"
  | "logging"
  | "ci_cd"
  | "container_registry"
  | "secret_management"
  | "email"
  | "search"
  | "analytics"
  | "ml_inference"
  | "scheduler"
  | "event_bus"
  | "service_mesh"
  | "waf"
  | "vpn"
  | "other";

export interface ArchResource {
  id: string;
  name: string;
  category: ResourceCategory;
  technology: string;
  purpose: string;
  tier: "essential" | "recommended" | "optional";
  scalingStrategy: string;
  estimatedMonthlyCostUsd: { min: number; max: number };
  notes: string;
}

export interface ArchDataFlow {
  from: string;
  to: string;
  protocol: string;
  description: string;
  dataType: string;
  async: boolean;
}

export interface ArchEnvironment {
  name: string;
  purpose: string;
  resources: string[];
  estimatedMonthlyCostUsd: { min: number; max: number };
}

export interface ArchSecurityBoundary {
  name: string;
  scope: string;
  controls: string[];
  threats: string[];
}

export interface ArchFailureMode {
  component: string;
  failureScenario: string;
  impact: string;
  mitigationStrategy: string;
  rto: string;
  rpo: string;
}

export interface ArchCostBreakdown {
  category: string;
  items: string[];
  estimatedMonthlyCostUsd: { min: number; max: number };
}

export interface ArchMilestone {
  phase: number;
  name: string;
  deliverables: string[];
  estimatedWeeks: number;
  dependencies: string[];
}

export interface SystemArchitecture {
  classification: SystemClassification;
  summary: string;
  principles: string[];
  resources: ArchResource[];
  dataFlows: ArchDataFlow[];
  environments: ArchEnvironment[];
  securityBoundaries: ArchSecurityBoundary[];
  failureModes: ArchFailureMode[];
  costBreakdown: ArchCostBreakdown[];
  totalEstimatedMonthlyCostUsd: { min: number; max: number };
  scalingNotes: string;
  tradeoffs: string[];
}

export interface BuilderVerificationFinding {
  code: string;
  severity: "info" | "warning" | "critical";
  source: "schema" | "rule" | "audit";
  message: string;
}

export interface BuilderVerificationSummary {
  status: "passed" | "passed_with_warnings" | "failed";
  confidence: "low" | "medium" | "high";
  findings: BuilderVerificationFinding[];
  metrics: {
    totalChecks: number;
    flaggedChecks: number;
    criticalFindings: number;
    warningFindings: number;
    auditFindings: number;
  };
}

export interface BuilderStructuredResult {
  requestUnderstanding: string;
  assumptions: string[];
  recommendedScope: string;
  architecture: SystemArchitecture;
  developmentPlan: ArchMilestone[];
  devopsPlan: string[];
  businessNotes: string[];
  competitiveAssessment: string;
  costSummary: {
    estimatedCredits: number;
    estimatedCostUsd: number;
    viabilityStatus: string;
    confidence: string;
    _realTokens?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  verification?: BuilderVerificationSummary;
  warnings: string[];
  nextSteps: string[];
}

export interface BuilderRequestRecord {
  id: string;
  userId: string;
  module: string;
  prompt: string;
  normalizedIntent?: string | null;
  requestClass: string;
  actionClass: string;
  status: string;
  viabilityStatus?: string | null;
  estimatedCostUsd: number;
  estimatedCredits: number;
  finalCostUsd: number;
  finalCredits: number;
  resultJson?: string | null;
  warningsJson?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  unitAmountCents: number;
  description: string;
}

export interface CreditLedgerEntry {
  id: string;
  eventType: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  metadataJson?: string | null;
  createdAt: string;
}

export interface ApprovalGateRecord {
  id: string;
  requestId: string;
  gateType: string;
  status: string;
  requiredRole: string;
  reason: string;
  resolvedByUserId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  request?: {
    id: string;
    prompt: string;
    actionClass: string;
    status: string;
  };
}

export interface AuditLogRecord {
  id: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  metadataJson?: string | null;
  createdAt: string;
}

export interface ReportingOverview {
  ownAccountability: {
    currentCreditBalance: number;
    purchasedCredits: number;
    deductedCredits: number;
    requestCount: number;
    actualCostUsd: number;
    pendingApprovalGates: number;
  };
  platformOverview: {
    userCount: number;
    requestCount: number;
    purchasedCredits: number;
    deductedCredits: number;
    actualCostUsd: number;
    pendingApprovalGates: number;
  };
  recentAuditEvents: AuditLogRecord[];
}

export interface UsageEventRecord {
  id: string;
  provider: string;
  serviceType: string;
  quantity: number;
  unit: string;
  estimatedCostUsd: number;
  actualCostUsd?: number | null;
  metadataJson?: string | null;
  createdAt: string;
}

export interface BuilderRequestDetail extends BuilderRequestRecord {
  approvalGates: ApprovalGateRecord[];
  usageEvents: UsageEventRecord[];
  auditLogs: AuditLogRecord[];
  creditLedger: CreditLedgerEntry[];
}

export interface ExecutionPolicyRecord {
  target:
    | "planning_only"
    | "research_read_only"
    | "artifact_generation"
    | "infrastructure_mutation"
    | "domain_mutation"
    | "ads_mutation"
    | "unknown_external_execution";
  policyStatus: "allowed" | "approval_required" | "manual_only" | "blocked";
  executorType: "none" | "external_research_executor";
  allowedInMvp: boolean;
  requiresApproval: boolean;
  requiresEnv: boolean;
  recommendedExecutionMode: "dry_run" | "live";
  reasons: string[];
}
