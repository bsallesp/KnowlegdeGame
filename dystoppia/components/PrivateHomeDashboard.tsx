"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRequireUser } from "@/lib/useRequireUser";

/* ── Types ────────────────────────────────────────────────────── */

interface Persona {
  id: string;
  name: string;
  emoji: string;
  reason: string;
  initialThought: string;
  isMandatory?: boolean;
  candidateCatalogType?: "azure_resources" | "developer_stack" | "academic_skills";
  candidatePool?: string[];
  candidateTopChoices?: string[];
  rankingBasis?: string;
  skillDomain?: string;
}

interface DebateMessage {
  personaId: string;
  message: string;
  replyTo: string | null;
}

interface ClarifyingQuestion {
  id: string;
  question: string;
  suggestions: string[];
}

interface PersonaAnalysis {
  personas: Persona[];
  projectSummary: string;
  clarifyingQuestions: ClarifyingQuestion[];
  initialDebate: DebateMessage[];
}

interface CoreFeature {
  name: string;
  description: string;
  priority: "must-have" | "should-have" | "nice-to-have";
  complexity: "low" | "medium" | "high";
}

interface MvpDecision {
  title: string;
  decision: string;
  rationale: string;
  alternativesConsidered: string[];
  tradeoffs: string;
  costImpact: string;
  timelineImpact: string;
  riskImpact: string;
}

interface MvpProposal {
  productName: string;
  oneLiner: string;
  coreFeatures: CoreFeature[];
  architecture: {
    summary: string;
    stack: string[];
    services: { name: string; purpose: string }[];
  };
  risks: { risk: string; mitigation: string; severity: string }[];
  phases: { name: string; duration: string; deliverables: string[] }[];
  decisionLog: MvpDecision[];
  outOfScope: string[];
  estimatedEffort: string;
  estimatedBuildCostUSD: string;
  estimatedMonthlyCostUSD: string;
  estimateAssumptions: string[];
  businessModel: string;
  legalConsiderations: string[];
  teamRecommendation: string;
}

interface ReadinessDecision {
  readyForMvp: boolean;
  reason: string;
  missingInfo: string[];
}

interface DepthProfile {
  tier: string;
  score: number;
  reasons: string[];
}

interface RefinementResult {
  refinedDebate: DebateMessage[];
  readiness: ReadinessDecision;
  nextQuestions: ClarifyingQuestion[];
  mvpProposal: MvpProposal | null;
  nextActions: string[];
  readinessGate?: {
    passed: boolean;
    gaps: string[];
  };
  depthProfile?: DepthProfile;
}

interface Conversation {
  id: string;
  title: string;
  prompt: string;
  analysis: PersonaAnalysis | null;
  refinement: RefinementResult | null;
  questions: ClarifyingQuestion[];
  questionRound: number;
  answersByQuestion: Record<string, string>;
  remarks: string[];
  userAnswers: string;
  phase: Phase;
  createdAt: string;
}

type Phase =
  | "idle"
  | "analyzing"
  | "personas-revealed"
  | "debate"
  | "questions"
  | "refining"
  | "refined-debate"
  | "proposal";

const VALID_PHASES: Phase[] = [
  "idle",
  "analyzing",
  "personas-revealed",
  "debate",
  "questions",
  "refining",
  "refined-debate",
  "proposal",
];

function normalizePhase(input: unknown): Phase {
  return typeof input === "string" &&
    VALID_PHASES.includes(input as Phase)
    ? (input as Phase)
    : "idle";
}

/* ── Conversation persistence ────────────────────────────────── */

const STORAGE_KEY = "dystoppia-conversations";
const UI_STATE_KEY = "dystoppia-dashboard-ui-state";
const DEFAULT_ANSWER_SUGGESTIONS = [
  "Ainda estou definindo isso",
  "Quero sua recomendacao",
  "Depende de custo e prazo",
];

function normalizeClarifyingQuestions(input: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item, index) => {
      if (typeof item === "string") {
        const question = item.trim();
        if (!question) return null;
        return {
          id: `question_${index + 1}`,
          question,
          suggestions: DEFAULT_ANSWER_SUGGESTIONS,
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
        suggestions:
          suggestions.length > 0 ? suggestions : DEFAULT_ANSWER_SUGGESTIONS,
      };
    })
    .filter((q): q is ClarifyingQuestion => q !== null);
}

function normalizeAnswersByQuestion(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};

  return Object.entries(input as Record<string, unknown>).reduce<
    Record<string, string>
  >((acc, [key, value]) => {
    if (typeof value === "string") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDecisionLog(input: unknown): MvpDecision[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as {
        title?: unknown;
        decision?: unknown;
        rationale?: unknown;
        alternativesConsidered?: unknown;
        tradeoffs?: unknown;
        costImpact?: unknown;
        timelineImpact?: unknown;
        riskImpact?: unknown;
      };

      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      const decision =
        typeof raw.decision === "string" ? raw.decision.trim() : "";
      const rationale =
        typeof raw.rationale === "string" ? raw.rationale.trim() : "";

      if (!title || !decision || !rationale) return null;

      return {
        title,
        decision,
        rationale,
        alternativesConsidered: normalizeStringList(raw.alternativesConsidered),
        tradeoffs: typeof raw.tradeoffs === "string" ? raw.tradeoffs.trim() : "",
        costImpact:
          typeof raw.costImpact === "string" ? raw.costImpact.trim() : "",
        timelineImpact:
          typeof raw.timelineImpact === "string"
            ? raw.timelineImpact.trim()
            : "",
        riskImpact:
          typeof raw.riskImpact === "string" ? raw.riskImpact.trim() : "",
      } satisfies MvpDecision;
    })
    .filter((decision): decision is MvpDecision => decision !== null);
}

function normalizeMvpProposal(input: unknown): MvpProposal | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  return {
    productName:
      typeof raw.productName === "string" ? raw.productName.trim() : "",
    oneLiner: typeof raw.oneLiner === "string" ? raw.oneLiner.trim() : "",
    coreFeatures: Array.isArray(raw.coreFeatures)
      ? (raw.coreFeatures as CoreFeature[])
      : [],
    architecture:
      raw.architecture && typeof raw.architecture === "object"
        ? {
            summary:
              typeof (raw.architecture as { summary?: unknown }).summary ===
              "string"
                ? ((raw.architecture as { summary: string }).summary ?? "")
                : "",
            stack: normalizeStringList(
              (raw.architecture as { stack?: unknown }).stack
            ),
            services: Array.isArray(
              (raw.architecture as { services?: unknown }).services
            )
              ? ((raw.architecture as { services: unknown[] }).services
                  .map((service) => {
                    if (!service || typeof service !== "object") return null;
                    const rs = service as { name?: unknown; purpose?: unknown };
                    const name =
                      typeof rs.name === "string" ? rs.name.trim() : "";
                    const purpose =
                      typeof rs.purpose === "string" ? rs.purpose.trim() : "";
                    if (!name || !purpose) return null;
                    return { name, purpose };
                  })
                  .filter(
                    (service): service is { name: string; purpose: string } =>
                      service !== null
                  ) ?? [])
              : [],
          }
        : { summary: "", stack: [], services: [] },
    risks: Array.isArray(raw.risks)
      ? (raw.risks as MvpProposal["risks"])
      : [],
    phases: Array.isArray(raw.phases)
      ? (raw.phases as MvpProposal["phases"])
      : [],
    decisionLog: normalizeDecisionLog(raw.decisionLog),
    outOfScope: normalizeStringList(raw.outOfScope),
    estimatedEffort:
      typeof raw.estimatedEffort === "string" ? raw.estimatedEffort.trim() : "",
    estimatedBuildCostUSD:
      typeof raw.estimatedBuildCostUSD === "string"
        ? raw.estimatedBuildCostUSD.trim()
        : "",
    estimatedMonthlyCostUSD:
      typeof raw.estimatedMonthlyCostUSD === "string"
        ? raw.estimatedMonthlyCostUSD.trim()
        : "",
    estimateAssumptions: normalizeStringList(raw.estimateAssumptions),
    businessModel:
      typeof raw.businessModel === "string" ? raw.businessModel.trim() : "",
    legalConsiderations: normalizeStringList(raw.legalConsiderations),
    teamRecommendation:
      typeof raw.teamRecommendation === "string"
        ? raw.teamRecommendation.trim()
        : "",
  };
}

function normalizeAnalysis(input: unknown): PersonaAnalysis | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as {
    personas?: unknown;
    projectSummary?: unknown;
    clarifyingQuestions?: unknown;
    initialDebate?: unknown;
  };

  if (!Array.isArray(raw.personas) || !Array.isArray(raw.initialDebate)) {
    return null;
  }

  return {
    personas: raw.personas as Persona[],
    projectSummary:
      typeof raw.projectSummary === "string" ? raw.projectSummary : "",
    clarifyingQuestions: normalizeClarifyingQuestions(raw.clarifyingQuestions),
    initialDebate: raw.initialDebate as DebateMessage[],
  };
}

function assignRoundQuestionIds(
  questions: ClarifyingQuestion[],
  round: number
): ClarifyingQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    id: `round_${round}_${question.id || `question_${index + 1}`}_${index + 1}`,
  }));
}

function normalizeRefinementResult(input: unknown): RefinementResult | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as {
    refinedDebate?: unknown;
    readiness?: unknown;
    nextQuestions?: unknown;
    mvpProposal?: unknown;
    nextActions?: unknown;
    readinessGate?: unknown;
    depthProfile?: unknown;
  };

  const readinessRaw =
    raw.readiness && typeof raw.readiness === "object"
      ? (raw.readiness as {
          readyForMvp?: unknown;
          reason?: unknown;
          missingInfo?: unknown;
        })
      : null;

  return {
    refinedDebate: Array.isArray(raw.refinedDebate)
      ? (raw.refinedDebate as DebateMessage[])
      : [],
    readiness: {
      readyForMvp: readinessRaw?.readyForMvp === true,
      reason:
        typeof readinessRaw?.reason === "string" ? readinessRaw.reason : "",
      missingInfo: Array.isArray(readinessRaw?.missingInfo)
        ? readinessRaw.missingInfo
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    },
    nextQuestions: normalizeClarifyingQuestions(raw.nextQuestions),
    mvpProposal: normalizeMvpProposal(raw.mvpProposal),
    nextActions: Array.isArray(raw.nextActions)
      ? raw.nextActions
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    readinessGate:
      raw.readinessGate && typeof raw.readinessGate === "object"
        ? {
            passed:
              (raw.readinessGate as { passed?: unknown }).passed === true,
            gaps: normalizeStringList(
              (raw.readinessGate as { gaps?: unknown }).gaps
            ),
          }
        : undefined,
    depthProfile:
      raw.depthProfile && typeof raw.depthProfile === "object"
        ? {
            tier:
              typeof (raw.depthProfile as { tier?: unknown }).tier === "string"
                ? (raw.depthProfile as { tier: string }).tier
                : "routine",
            score:
              typeof (raw.depthProfile as { score?: unknown }).score ===
              "number"
                ? (raw.depthProfile as { score: number }).score
                : 0,
            reasons: normalizeStringList(
              (raw.depthProfile as { reasons?: unknown }).reasons
            ),
          }
        : undefined,
  };
}

function toUserAnswersText(
  questions: ClarifyingQuestion[],
  answersByQuestion: Record<string, string>
): string {
  return questions
    .map(
      (q, i) =>
        `${i + 1}. ${q.question}\nAnswer: ${
          answersByQuestion[q.id]?.trim() || "(no answer)"
        }`
    )
    .join("\n\n");
}

function normalizeConversation(input: unknown): Conversation | null {
  if (!input || typeof input !== "object") return null;
  const rawConversation = input as {
    id?: unknown;
    title?: unknown;
    prompt?: unknown;
    analysis?: unknown;
    refinement?: unknown;
    questions?: unknown;
    questionRound?: unknown;
    answersByQuestion?: unknown;
    remarks?: unknown;
    userAnswers?: unknown;
    phase?: unknown;
    createdAt?: unknown;
  };

  const id = typeof rawConversation.id === "string" ? rawConversation.id : "";
  const prompt =
    typeof rawConversation.prompt === "string" ? rawConversation.prompt : "";
  const createdAt =
    typeof rawConversation.createdAt === "string"
      ? rawConversation.createdAt
      : new Date().toISOString();

  if (!id || !prompt) return null;

  const analysis = normalizeAnalysis(rawConversation.analysis);
  const storedQuestions = normalizeClarifyingQuestions(rawConversation.questions);
  const questions =
    storedQuestions.length > 0
      ? storedQuestions
      : analysis?.clarifyingQuestions ?? [];
  const questionRound =
    typeof rawConversation.questionRound === "number" &&
    rawConversation.questionRound > 0
      ? Math.floor(rawConversation.questionRound)
      : 1;
  const answersByQuestion = normalizeAnswersByQuestion(
    rawConversation.answersByQuestion
  );
  const remarks = normalizeStringList(rawConversation.remarks);
  const userAnswers =
    typeof rawConversation.userAnswers === "string"
      ? rawConversation.userAnswers
      : questions.length > 0
        ? toUserAnswersText(questions, answersByQuestion)
        : "";

  return {
    id,
    title:
      typeof rawConversation.title === "string" && rawConversation.title.trim()
        ? rawConversation.title
        : truncate(prompt, 60),
    prompt,
    analysis,
    refinement: normalizeRefinementResult(rawConversation.refinement),
    questions,
    questionRound,
    answersByQuestion,
    remarks,
    userAnswers,
    phase: normalizePhase(rawConversation.phase),
    createdAt,
  } satisfies Conversation;
}

function normalizeConversationsArray(input: unknown): Conversation[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => normalizeConversation(item))
    .filter((conversation): conversation is Conversation => conversation !== null);
}

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    return normalizeConversationsArray(parsed);
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function loadUiState(): { activeId: string | null; sidebarOpen: boolean } {
  if (typeof window === "undefined") {
    return { activeId: null, sidebarOpen: true };
  }

  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return { activeId: null, sidebarOpen: true };
    const parsed = JSON.parse(raw) as {
      activeId?: unknown;
      sidebarOpen?: unknown;
    };

    return {
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      sidebarOpen:
        typeof parsed.sidebarOpen === "boolean" ? parsed.sidebarOpen : true,
    };
  } catch {
    return { activeId: null, sidebarOpen: true };
  }
}

function saveUiState(state: { activeId: string | null; sidebarOpen: boolean }) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

/* ── Neural graph background ─────────────────────────────────── */

interface GNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pulsePhase: number;
}

const COLORS = ["#818CF8", "#38BDF8", "#60A5FA", "#A78BFA", "#6366F1"];
const NODE_COUNT = 70;
const CONNECTION_DIST = 140;

function useNeuralCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  const nodesRef = useRef<GNode[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouse);

    nodesRef.current = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      radius: Math.random() * 2.5 + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    let time = 0;
    let frame = 0;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      time += 0.01;

      const nodes = nodesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const n of nodes) {
        const dmx = n.x - mx;
        const dmy = n.y - my;
        const dmDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dmDist < 180 && dmDist > 0) {
          const force = (1 - dmDist / 180) * 0.3;
          n.vx += (dmx / dmDist) * force;
          n.vy += (dmy / dmDist) * force;
        }
        n.vx *= 0.995;
        n.vy *= 0.995;
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.25;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(129, 140, 248, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const pulse = Math.sin(time * 2 + n.pulsePhase) * 0.3 + 0.7;
        const r = n.radius * pulse;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = n.color + "0A";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color + "CC";
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [ref]);
}

/* ── Helpers ──────────────────────────────────────────────────── */

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.round(hr / 24);
  return `${d}d`;
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/* ── Main component ──────────────────────────────────────────── */

export default function PrivateHomeDashboard() {
  const { loading } = useRequireUser();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useNeuralCanvas(canvasRef);

  /* Conversation state */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* Current session state */
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [analysis, setAnalysis] = useState<PersonaAnalysis | null>(null);
  const [refinement, setRefinement] = useState<RefinementResult | null>(null);
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [questionRound, setQuestionRound] = useState(1);
  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<string, string>
  >({});
  const [remarks, setRemarks] = useState<string[]>([]);
  const [composerInput, setComposerInput] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [userAnswers, setUserAnswers] = useState("");
  const [visiblePersonas, setVisiblePersonas] = useState(0);
  const [visibleDebate, setVisibleDebate] = useState(0);
  const [visibleRefinedDebate, setVisibleRefinedDebate] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const debateEndRef = useRef<HTMLDivElement>(null);
  const refinedDebateEndRef = useRef<HTMLDivElement>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncConversationsToServer = useCallback(
    async (items: Conversation[]) => {
      try {
        await fetch("/api/onboarding/conversations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversations: items }),
        });
      } catch {
        // Silent fallback: local cache remains available even if remote sync fails.
      }
    },
    []
  );

  /* Load conversations from server (fallback to local cache) on mount */
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const cachedConversations = loadConversations();
      const uiState = loadUiState();
      setSidebarOpen(uiState.sidebarOpen);

      let sourceConversations = cachedConversations;

      try {
        const res = await fetch("/api/onboarding/conversations", {
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as { conversations?: unknown };
          const serverConversations = normalizeConversationsArray(
            body.conversations
          );

          if (serverConversations.length > 0) {
            const mergedById = new Map(
              serverConversations.map((conversation) => [
                conversation.id,
                conversation,
              ])
            );
            for (const cachedConversation of cachedConversations) {
              if (!mergedById.has(cachedConversation.id)) {
                mergedById.set(cachedConversation.id, cachedConversation);
              }
            }
            sourceConversations = Array.from(mergedById.values()).sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            saveConversations(sourceConversations);
            if (sourceConversations.length !== serverConversations.length) {
              // Backfill missing local items into the server snapshot.
              void syncConversationsToServer(sourceConversations);
            }
          } else if (cachedConversations.length > 0) {
            // One-time backfill for users that had conversations only in local storage.
            void syncConversationsToServer(cachedConversations);
          }
        }
      } catch {
        // Keep using local cache when server fetch fails.
      }

      if (cancelled) return;

      setConversations(sourceConversations);

      const selectedActiveId =
        uiState.activeId &&
        sourceConversations.some((conversation) => conversation.id === uiState.activeId)
          ? uiState.activeId
          : sourceConversations[0]?.id ?? null;

      if (selectedActiveId) {
        const activeConversation = sourceConversations.find(
          (conversation) => conversation.id === selectedActiveId
        );
        if (activeConversation) {
          setActiveId(activeConversation.id);
          setPrompt(activeConversation.prompt);
          setAnalysis(activeConversation.analysis);
          setRefinement(activeConversation.refinement);
          setQuestions(activeConversation.questions ?? []);
          setQuestionRound(activeConversation.questionRound ?? 1);
          setAnswersByQuestion(activeConversation.answersByQuestion ?? {});
          setRemarks(activeConversation.remarks ?? []);
          setUserAnswers(activeConversation.userAnswers ?? "");
          setPhase(activeConversation.phase ?? "idle");
          setVisiblePersonas(activeConversation.analysis?.personas.length ?? 0);
          setVisibleDebate(
            activeConversation.analysis?.initialDebate.length ?? 0
          );
          setVisibleRefinedDebate(
            activeConversation.refinement?.refinedDebate.length ?? 0
          );
        }
      }

      setHasHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [syncConversationsToServer]);

  /* Persist conversations locally + server sync */
  useEffect(() => {
    if (!hasHydrated) return;
    saveConversations(conversations);
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      void syncConversationsToServer(conversations);
    }, 500);
  }, [conversations, hasHydrated, syncConversationsToServer]);

  /* Persist sidebar + selected conversation */
  useEffect(() => {
    if (!hasHydrated) return;
    saveUiState({ activeId, sidebarOpen });
  }, [activeId, sidebarOpen, hasHydrated]);

  /* Staggered persona reveal */
  useEffect(() => {
    if (phase !== "personas-revealed" || !analysis) return;
    if (visiblePersonas >= analysis.personas.length) {
      const t = setTimeout(() => setPhase("debate"), 800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisiblePersonas((v) => v + 1), 300);
    return () => clearTimeout(t);
  }, [phase, visiblePersonas, analysis]);

  /* Staggered debate */
  useEffect(() => {
    if (phase !== "debate" || !analysis) return;
    if (visibleDebate >= analysis.initialDebate.length) {
      const t = setTimeout(() => {
        setPhase("questions");
        // persist final state
        updateConversation(activeId, { phase: "questions" });
      }, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleDebate((v) => v + 1), 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleDebate, analysis]);

  /* Staggered refined debate */
  useEffect(() => {
    if (phase !== "refined-debate" || !refinement) return;
    if (visibleRefinedDebate >= refinement.refinedDebate.length) {
      const t = setTimeout(() => {
        if (refinement.readiness.readyForMvp) {
          setPhase("proposal");
          updateConversation(activeId, { phase: "proposal" });
          return;
        }

        const nextRound = questionRound + 1;
        const nextQuestions = assignRoundQuestionIds(
          refinement.nextQuestions,
          nextRound
        );

        if (nextQuestions.length > 0) {
          setQuestions((prev) => {
            const existing = new Set(prev.map((q) => q.id));
            const appendable = nextQuestions.filter((q) => !existing.has(q.id));
            return appendable.length > 0 ? [...prev, ...appendable] : prev;
          });
          setQuestionRound(nextRound);
        } else {
          setError(
            "Team is not ready for MVP yet, but no follow-up questions were returned. Try re-checking readiness."
          );
        }

        setPhase("questions");
        updateConversation(activeId, { phase: "questions" });
      }, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleRefinedDebate((v) => v + 1), 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleRefinedDebate, refinement, questionRound]);

  /* Auto-scroll debate */
  useEffect(() => {
    debateEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleDebate, phase]);

  useEffect(() => {
    refinedDebateEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleRefinedDebate, phase]);

  /* Keep active conversation fully synced */
  useEffect(() => {
    if (!activeId) return;
    updateConversation(activeId, {
      prompt,
      analysis,
      refinement,
      questions,
      questionRound,
      answersByQuestion,
      remarks,
      userAnswers,
      phase,
    });
  }, [
    activeId,
    prompt,
    analysis,
    refinement,
    questions,
    questionRound,
    answersByQuestion,
    remarks,
    userAnswers,
    phase,
  ]);

  useEffect(() => {
    if (questions.length === 0) {
      setUserAnswers("");
      return;
    }
    setUserAnswers(toUserAnswersText(questions, answersByQuestion));
  }, [questions, answersByQuestion]);

  /* ── Conversation CRUD ──────────────────────────────────────── */

  function updateConversation(id: string | null, patch: Partial<Conversation>) {
    if (!id) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function startNewConversation() {
    setActiveId(null);
    setPrompt("");
    setPhase("idle");
    setAnalysis(null);
    setRefinement(null);
    setQuestions([]);
    setQuestionRound(1);
    setAnswersByQuestion({});
    setRemarks([]);
    setComposerInput("");
    setUserAnswers("");
    setVisibleRefinedDebate(0);
    setVisiblePersonas(0);
    setVisibleDebate(0);
    setError("");
    setNotice("");
  }

  function loadConversation(convo: Conversation) {
    setActiveId(convo.id);
    setPrompt(convo.prompt);
    setAnalysis(convo.analysis);
    setRefinement(convo.refinement);
    setQuestions(convo.questions ?? convo.analysis?.clarifyingQuestions ?? []);
    setQuestionRound(convo.questionRound ?? 1);
    setAnswersByQuestion(convo.answersByQuestion ?? {});
    setRemarks(convo.remarks ?? []);
    setComposerInput("");
    setUserAnswers(convo.userAnswers ?? "");
    setPhase(convo.phase ?? (convo.analysis ? "questions" : "idle"));
    setVisiblePersonas(convo.analysis?.personas.length ?? 0);
    setVisibleDebate(convo.analysis?.initialDebate.length ?? 0);
    setVisibleRefinedDebate(convo.refinement?.refinedDebate.length ?? 0);
    setError("");
    setNotice("");
  }

  function deleteConversation(id: string) {
    setConversations((prev) => {
      return prev.filter((c) => c.id !== id);
    });
    if (activeId === id) startNewConversation();
  }

  /* ── Submit ─────────────────────────────────────────────────── */

  const handleSubmit = useCallback(
    async (e?: React.FormEvent, manualText?: string) => {
      if (e) e.preventDefault();
      const text = (manualText ?? prompt).trim();
      if (!text || phase === "analyzing" || phase === "refining") return;

      // Create conversation
      const id = "conv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const convo: Conversation = {
        id,
        title: truncate(text, 60),
        prompt: text,
        analysis: null,
        refinement: null,
        questions: [],
        questionRound: 1,
        answersByQuestion: {},
        remarks: [],
        userAnswers: "",
        phase: "analyzing",
        createdAt: new Date().toISOString(),
      };
      setConversations((prev) => [convo, ...prev]);
      setActiveId(id);

      setError("");
      setPhase("analyzing");
      setAnalysis(null);
      setRefinement(null);
      setQuestions([]);
      setQuestionRound(1);
      setAnswersByQuestion({});
      setRemarks([]);
      setComposerInput("");
      setUserAnswers("");
      setVisibleRefinedDebate(0);
      setVisiblePersonas(0);
      setVisibleDebate(0);

      try {
        const res = await fetch("/api/onboarding/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error || "Analysis failed"
          );
        }

        const rawData = (await res.json()) as PersonaAnalysis;
        const initialQuestions = assignRoundQuestionIds(
          normalizeClarifyingQuestions(rawData.clarifyingQuestions),
          1
        );
        const data: PersonaAnalysis = {
          ...rawData,
          clarifyingQuestions: initialQuestions,
        };
        setAnalysis(data);
        setQuestions(initialQuestions);
        setQuestionRound(1);
        setPhase("personas-revealed");
        setNotice("");

        // Persist to conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  analysis: data,
                  questions: initialQuestions,
                  questionRound: 1,
                  remarks: [],
                  phase: "personas-revealed",
                }
              : c
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setNotice("");
        setPhase("idle");
        // Remove failed conversation
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setActiveId(null);
      }
    },
    [prompt, phase]
  );

  const handleRefine = useCallback(async (input?: unknown) => {
    if (!analysis || !prompt.trim()) return;
    if (phase === "refining" || phase === "analyzing") return;
    if (questions.length === 0) {
      setError("No questions available for refinement.");
      return;
    }

    let note = "";
    let allowPartial = false;
    if (typeof input === "string") {
      note = input;
    } else if (input && typeof input === "object") {
      const raw = input as { note?: unknown; allowPartial?: unknown };
      note = typeof raw.note === "string" ? raw.note : "";
      allowPartial = raw.allowPartial === true;
    }

    const unanswered = questions.filter(
      (question) => !answersByQuestion[question.id]?.trim()
    );
    if (unanswered.length > 0 && !allowPartial) {
      setError(
        `Please answer all questions before continuing (${unanswered.length} remaining).`
      );
      setNotice(
        `Still missing ${unanswered.length} answer(s). You can answer them or use "Proceed with assumptions".`
      );
      return;
    }

    const trimmedNote = typeof note === "string" ? note.trim() : "";
    const nextRemarks = trimmedNote ? [...remarks, trimmedNote] : remarks;
    if (trimmedNote) {
      setRemarks(nextRemarks);
    }

    const qaHistory = questions
      .map((question) => {
        const answer = answersByQuestion[question.id]?.trim() || "";
        if (answer) {
          return {
            question: question.question,
            answer,
          };
        }
        if (allowPartial) {
          return {
            question: question.question,
            answer:
              "[Not answered by user. Infer a realistic assumption and list it in estimateAssumptions.]",
          };
        }
        return null;
      })
      .filter(
        (
          item
        ): item is {
          question: string;
          answer: string;
        } => item !== null
      );
    const noteHistory = nextRemarks.map((remark, i) => ({
      question: `User remark ${i + 1}`,
      answer: remark,
    }));

    setError("");
    setNotice("");
    setPhase("refining");
    setVisibleRefinedDebate(0);

    try {
      const res = await fetch("/api/onboarding/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalPrompt: prompt.trim(),
          personas: analysis.personas.map((persona) => ({
            id: persona.id,
            name: persona.name,
            emoji: persona.emoji,
            reason: persona.reason,
            isMandatory: persona.isMandatory === true,
            candidateCatalogType: persona.candidateCatalogType,
            candidateTopChoices: Array.isArray(persona.candidateTopChoices)
              ? persona.candidateTopChoices.slice(0, 24)
              : undefined,
            rankingBasis: persona.rankingBasis,
            skillDomain: persona.skillDomain,
          })),
          projectSummary: analysis.projectSummary,
          qaHistory: [...qaHistory, ...noteHistory],
          iteration: questionRound,
          existingMvpProposal: refinement?.mvpProposal ?? null,
          allowAssumptions: allowPartial,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Refinement failed"
        );
      }

      const parsed = (await res.json()) as unknown;
      const result = normalizeRefinementResult(parsed);
      if (!result) {
        throw new Error("Invalid refinement response");
      }

      setRefinement(result);
      setVisibleRefinedDebate(0);
      setPhase("refined-debate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed");
      setNotice("");
      setPhase("questions");
    }
  }, [
    analysis,
    prompt,
    phase,
    questions,
    answersByQuestion,
    questionRound,
    remarks,
    refinement,
  ]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#09090E" }}
      />
    );
  }

  const getPersona = (id: string) =>
    analysis?.personas.find((p) => p.id === id);
  function syncAnswers(nextAnswers: Record<string, string>) {
    const compact = Object.entries(nextAnswers).reduce<Record<string, string>>(
      (acc, [questionId, answer]) => {
        if (answer.trim()) acc[questionId] = answer;
        return acc;
      },
      {}
    );

    const combinedAnswers = toUserAnswersText(questions, compact);
    setUserAnswers(combinedAnswers);
    updateConversation(activeId, {
      answersByQuestion: compact,
      userAnswers: combinedAnswers,
    });
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswersByQuestion((prev) => {
      const next = { ...prev, [questionId]: value };
      syncAnswers(next);
      return next;
    });
  }

  function applySuggestion(questionId: string, suggestion: string) {
    updateAnswer(questionId, suggestion);
  }

  const unansweredCount = questions.filter(
    (question) => !answersByQuestion[question.id]?.trim()
  ).length;
  const answeredCount = questions.length - unansweredCount;
  const canContinueToRefinement =
    questions.length > 0 &&
    unansweredCount === 0 &&
    phase !== "refining" &&
    phase !== "analyzing";
  const canProceedWithAssumptions =
    questions.length > 0 &&
    answeredCount > 0 &&
    unansweredCount > 0 &&
    phase !== "refining" &&
    phase !== "analyzing";
  const visibleRefinedMessages =
    phase === "refined-debate"
      ? visibleRefinedDebate
      : refinement?.refinedDebate.length ?? 0;
  const isComposerBusy = phase === "analyzing" || phase === "refining";
  const canSendComposer = composerInput.trim().length > 0 && !isComposerBusy;
  const composerPlaceholder = !analysis
    ? "Describe your app idea..."
    : phase === "proposal"
      ? "Add remarks to revisit this MVP..."
      : "Add context or send a note to the team...";
  const composerActionLabel = !analysis
    ? "Analyze"
    : phase === "proposal"
      ? "Re-discuss MVP"
      : "Send";

  async function handleComposerSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = composerInput.trim();
    if (!text || isComposerBusy) return;

    setComposerInput("");
    setError("");

    if (!analysis) {
      setNotice("");
      await handleSubmit(undefined, text);
      return;
    }

    if (phase === "questions" && unansweredCount > 0) {
      setRemarks((prev) => [...prev, text]);
      setNotice(
        `Remark saved. Answer the remaining ${unansweredCount} question(s) to continue.`
      );
      return;
    }

    setNotice("Remark sent. Team is re-discussing internally...");
    await handleRefine(text);
  }

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div
      className="relative h-screen flex overflow-hidden"
      style={{ backgroundColor: "#09090E" }}
    >
      {/* Neural canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ opacity: 0.45, zIndex: 0 }}
      />

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-20 flex-shrink-0 h-full flex flex-col overflow-hidden"
            style={{
              backgroundColor: "#0C0C14",
              borderRight: "1px solid #1C1C28",
            }}
          >
            {/* Sidebar header */}
            <div
              className="flex items-center justify-between px-4 py-4"
              style={{ borderBottom: "1px solid #1C1C28" }}
            >
              <span
                className="font-bold text-sm tracking-tight"
                style={{ color: "#EEEEFF" }}
              >
                Dystoppia
              </span>
              <button
                onClick={startNewConversation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: "rgba(129,140,248,0.12)",
                  border: "1px solid rgba(129,140,248,0.25)",
                  color: "#818CF8",
                }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New
              </button>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto py-2 px-2">
              {conversations.length === 0 && (
                <p
                  className="text-xs text-center py-8 px-4"
                  style={{ color: "#6B6B8A" }}
                >
                  No conversations yet. Start one above.
                </p>
              )}

              {conversations.map((convo) => {
                const isActive = convo.id === activeId;
                return (
                  <div
                    key={convo.id}
                    className="group flex items-center gap-1 mb-0.5"
                  >
                    <button
                      onClick={() => loadConversation(convo)}
                      className="flex-1 text-left px-3 py-2.5 rounded-lg transition-all truncate"
                      style={{
                        backgroundColor: isActive
                          ? "rgba(129,140,248,0.1)"
                          : "transparent",
                        color: isActive ? "#EEEEFF" : "#9494B8",
                        border: isActive
                          ? "1px solid rgba(129,140,248,0.2)"
                          : "1px solid transparent",
                      }}
                    >
                      <p className="text-sm truncate leading-snug">
                        {convo.title}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "#6B6B8A" }}
                      >
                        {timeAgo(convo.createdAt)} ago
                      </p>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(convo.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1.5 rounded transition-all"
                      style={{ color: "#6B6B8A" }}
                      title="Delete"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Sidebar footer */}
            <div
              className="px-4 py-3 flex flex-col gap-1"
              style={{ borderTop: "1px solid #1C1C28" }}
            >
              <Link
                href="/products"
                className="text-xs px-2 py-1.5 rounded transition-colors"
                style={{ color: "#9494B8" }}
              >
                Products
              </Link>
              <Link
                href="/settings"
                className="text-xs px-2 py-1.5 rounded transition-colors"
                style={{ color: "#9494B8" }}
              >
                Settings
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "#9494B8" }}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
          {activeId && (
            <span
              className="text-sm truncate"
              style={{ color: "#9494B8" }}
            >
              {conversations.find((c) => c.id === activeId)?.title}
            </span>
          )}
        </div>

        {/* Content */}
        <main className="flex-1 flex flex-col items-center overflow-y-auto px-6 pb-8">
          {error && phase !== "idle" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-4xl mt-2 mb-4 text-sm px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "rgba(249,115,22,0.1)",
                border: "1px solid rgba(249,115,22,0.3)",
                color: "#F97316",
              }}
            >
              {error}
            </motion.p>
          )}

          {/* Idle / Input state */}
          {phase === "idle" && !activeId && (
            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col items-center"
              >
                <h1
                  className="text-4xl md:text-5xl font-bold tracking-tight mb-3 text-center"
                  style={{
                    background:
                      "linear-gradient(135deg, #818CF8 0%, #38BDF8 50%, #818CF8 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundSize: "200% 200%",
                    animation: "gradientShift 6s ease infinite",
                  }}
                >
                  Dystoppia
                </h1>
                <p
                  className="text-base mb-10"
                  style={{ color: "#9494B8" }}
                >
                  Describe what you want to build.
                </p>

                <form onSubmit={handleSubmit} className="w-full">
                  <div
                    className="rounded-2xl overflow-hidden transition-shadow"
                    style={{
                      backgroundColor: "#12121A",
                      border: "1px solid #2E2E40",
                      boxShadow:
                        "0 0 0 1px rgba(129,140,248,0.05), 0 8px 40px rgba(0,0,0,0.5)",
                    }}
                  >
                    <textarea
                      rows={3}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. I need a system for my physiotherapy clinic..."
                      className="w-full resize-none bg-transparent px-5 py-4 text-base outline-none"
                      style={{ color: "#EEEEFF" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                    />
                    <div
                      className="flex items-center justify-between px-5 py-3"
                      style={{ borderTop: "1px solid #1C1C28" }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: "#6B6B8A" }}
                      >
                        We&apos;ll assemble the right team for your project
                      </span>
                      <button
                        type="submit"
                        disabled={!prompt.trim()}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                        style={{
                          backgroundColor: "#818CF8",
                          color: "#09090E",
                        }}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13 7l5 5m0 0l-5 5m5-5H6"
                          />
                        </svg>
                        Analyze
                      </button>
                    </div>
                  </div>
                </form>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 text-sm px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "rgba(249,115,22,0.1)",
                      border: "1px solid rgba(249,115,22,0.3)",
                      color: "#F97316",
                    }}
                  >
                    {error}
                  </motion.p>
                )}
              </motion.div>
            </div>
          )}

          {/* Analyzing spinner */}
          {phase === "analyzing" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="w-12 h-12 rounded-full"
                style={{
                  border: "3px solid transparent",
                  borderTopColor: "#818CF8",
                  borderRightColor: "#38BDF8",
                }}
              />
              <div className="text-center">
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "#EEEEFF" }}
                >
                  Analyzing your request...
                </p>
                <p className="text-xs" style={{ color: "#9494B8" }}>
                  Identifying the right professionals for the job
                </p>
              </div>
              <div
                className="mt-4 px-5 py-3 rounded-xl text-sm max-w-lg text-center"
                style={{
                  backgroundColor: "#12121A",
                  border: "1px solid #2E2E40",
                  color: "#9494B8",
                }}
              >
                &ldquo;{prompt}&rdquo;
              </div>
            </div>
          )}

          {/* Refining spinner */}
          {phase === "refining" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1.6,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="w-12 h-12 rounded-full"
                style={{
                  border: "3px solid transparent",
                  borderTopColor: "#38BDF8",
                  borderRightColor: "#818CF8",
                }}
              />
              <div className="text-center">
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "#EEEEFF" }}
                >
                  Team alignment in progress...
                </p>
                <p className="text-xs" style={{ color: "#9494B8" }}>
                  Personas are checking if we are ready for an MVP proposal
                </p>
              </div>
            </div>
          )}

          {/* Results: personas + debate + questions */}
          {analysis &&
            phase !== "idle" &&
            phase !== "analyzing" &&
            phase !== "refining" && (
            <div className="w-full max-w-4xl mt-4">
              {/* User prompt recap */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-start gap-3"
              >
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm"
                  style={{
                    backgroundColor: "#1C1C28",
                    color: "#9494B8",
                  }}
                >
                  U
                </div>
                <div
                  className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm"
                  style={{
                    backgroundColor: "#12121A",
                    border: "1px solid #2E2E40",
                    color: "#EEEEFF",
                  }}
                >
                  {prompt}
                </div>
              </motion.div>

              {remarks.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6"
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "#38BDF8" }}
                  >
                    User Remarks ({remarks.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {remarks.slice(-4).map((remark, i) => (
                      <div
                        key={`${remark}_${i}`}
                        className="px-4 py-3 rounded-xl text-sm"
                        style={{
                          backgroundColor: "#12121A",
                          border: "1px solid #2E2E40",
                          color: "#BFD9FF",
                        }}
                      >
                        {remark}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Project summary */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-8 px-5 py-4 rounded-2xl"
                style={{
                  backgroundColor: "rgba(129,140,248,0.06)",
                  border: "1px solid rgba(129,140,248,0.15)",
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "#818CF8" }}
                >
                  Project Understanding
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "#EEEEFF" }}
                >
                  {analysis.projectSummary}
                </p>
              </motion.div>

              {/* Personas raised */}
              <div className="mb-8">
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-4"
                  style={{ color: "#818CF8" }}
                >
                  Team Assembled ({analysis.personas.length} specialists)
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {analysis.personas
                      .slice(0, visiblePersonas)
                      .map((persona) => (
                        <motion.div
                          key={persona.id}
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          className="rounded-xl p-4"
                          style={{
                            backgroundColor: "#12121A",
                            border: "1px solid #2E2E40",
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">
                              {persona.emoji}
                            </span>
                            <span
                              className="text-sm font-bold"
                              style={{ color: "#EEEEFF" }}
                            >
                              {persona.name}
                            </span>
                          </div>
                          <p
                            className="text-xs leading-relaxed mb-2"
                            style={{ color: "#9494B8" }}
                          >
                            {persona.reason}
                          </p>
                          {Array.isArray(persona.candidateTopChoices) &&
                            persona.candidateTopChoices.length > 0 && (
                            <div
                              className="mb-2 px-2.5 py-2 rounded-lg"
                              style={{
                                backgroundColor: "#0D0D15",
                                border: "1px solid #1C1C28",
                              }}
                            >
                              <p
                                className="text-[10px] uppercase tracking-wider font-semibold mb-1"
                                style={{ color: "#38BDF8" }}
                              >
                                {persona.candidateCatalogType === "azure_resources"
                                  ? "Candidate Azure Resources"
                                  : persona.candidateCatalogType === "developer_stack"
                                    ? "Candidate Developer Stack"
                                    : "Candidate Academic Skills"}
                              </p>
                              {persona.skillDomain && (
                                <p
                                  className="text-[10px] mb-1"
                                  style={{ color: "#7DD3FC" }}
                                >
                                  Domain: {persona.skillDomain.replace(/_/g, " ")}
                                </p>
                              )}
                              <p
                                className="text-[11px] leading-relaxed"
                                style={{ color: "#BFD9FF" }}
                              >
                                {persona.candidateTopChoices
                                  .slice(0, 6)
                                  .join(" · ")}
                                {persona.candidateTopChoices.length > 6
                                  ? ` · +${persona.candidateTopChoices.length - 6} more`
                                  : ""}
                              </p>
                            </div>
                          )}
                          <p
                            className="text-xs italic leading-relaxed"
                            style={{ color: "#6B6B8A" }}
                          >
                            &ldquo;{persona.initialThought}&rdquo;
                          </p>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Debate */}
              {(phase === "debate" || phase === "questions") && (
                <div className="mb-8">
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-4"
                    style={{ color: "#818CF8" }}
                  >
                    Internal Debate
                  </p>
                  <div
                    className="rounded-2xl p-5 flex flex-col gap-4 max-h-[500px] overflow-y-auto"
                    style={{
                      backgroundColor: "#0D0D15",
                      border: "1px solid #1C1C28",
                    }}
                  >
                    <AnimatePresence>
                      {analysis.initialDebate
                        .slice(0, visibleDebate)
                        .map((msg, i) => {
                          const persona = getPersona(msg.personaId);
                          if (!persona) return null;
                          const isCS =
                            msg.personaId === "customer_success";
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-start gap-3"
                            >
                              <div
                                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm"
                                style={{
                                  backgroundColor: isCS
                                    ? "rgba(56,189,248,0.15)"
                                    : "#1C1C28",
                                }}
                              >
                                {persona.emoji}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span
                                    className="text-xs font-bold"
                                    style={{
                                      color: isCS
                                        ? "#38BDF8"
                                        : "#EEEEFF",
                                    }}
                                  >
                                    {persona.name}
                                  </span>
                                  {msg.replyTo && (
                                    <span
                                      className="text-xs"
                                      style={{ color: "#6B6B8A" }}
                                    >
                                      replying to{" "}
                                      {getPersona(msg.replyTo)?.name}
                                    </span>
                                  )}
                                </div>
                                <p
                                  className="text-sm leading-relaxed"
                                  style={{ color: "#9494B8" }}
                                >
                                  {msg.message}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                    </AnimatePresence>

                    {phase === "debate" &&
                      visibleDebate <
                        analysis.initialDebate.length && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2"
                        >
                          <div className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor: "#818CF8",
                                }}
                                animate={{
                                  opacity: [0.3, 1, 0.3],
                                }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                  delay: i * 0.2,
                                }}
                              />
                            ))}
                          </div>
                          <span
                            className="text-xs"
                            style={{ color: "#6B6B8A" }}
                          >
                            {getPersona(
                              analysis.initialDebate[visibleDebate]
                                ?.personaId
                            )?.name ?? "Someone"}{" "}
                            is thinking...
                          </span>
                        </motion.div>
                      )}

                    <div ref={debateEndRef} />
                  </div>
                </div>
              )}

              {/* Clarifying questions */}
              {phase === "questions" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8"
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-4"
                    style={{ color: "#38BDF8" }}
                  >
                    We need your input
                  </p>
                  <div
                    className="rounded-2xl p-5 flex flex-col gap-3"
                    style={{
                      backgroundColor: "rgba(56,189,248,0.06)",
                      border: "1px solid rgba(56,189,248,0.15)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">
                        {getPersona("customer_success")?.emoji ??
                          "💬"}
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: "#38BDF8" }}
                      >
                        {getPersona("customer_success")?.name ??
                          "Customer Success"}
                      </span>
                    </div>
                    <p
                      className="text-sm mb-3"
                      style={{ color: "#9494B8" }}
                    >
                      Before we move forward, the team needs answers
                      to these questions:
                    </p>
                    {refinement && !refinement.readiness.readyForMvp && (
                      <div
                        className="mb-3 rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: "rgba(249,115,22,0.08)",
                          border: "1px solid rgba(249,115,22,0.28)",
                        }}
                      >
                        <p
                          className="text-xs font-semibold mb-1"
                          style={{ color: "#FDBA74" }}
                        >
                          Not ready for MVP yet
                        </p>
                        <p className="text-sm" style={{ color: "#FED7AA" }}>
                          {refinement.readiness.reason ||
                            "The team needs a few more details before presenting an MVP."}
                        </p>
                        {refinement.readiness.missingInfo.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1">
                            {refinement.readiness.missingInfo.map((item, i) => (
                              <li
                                key={`${item}_${i}`}
                                className="text-xs"
                                style={{ color: "#FDBA74" }}
                              >
                                • {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs" style={{ color: "#6B6B8A" }}>
                        One response per question
                      </p>
                      <p className="text-xs" style={{ color: "#6B6B8A" }}>
                        {answeredCount}/{questions.length} answered
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {questions.map((question, i) => {
                        const currentAnswer =
                          answersByQuestion[question.id] ?? "";
                        const answered = Boolean(currentAnswer.trim());

                        return (
                          <div
                            key={`${question.id}_${i}`}
                            className="rounded-xl p-4"
                            style={{
                              backgroundColor: "#0F0F18",
                              border: answered
                                ? "1px solid rgba(56,189,248,0.35)"
                                : "1px solid #232336",
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{
                                  backgroundColor:
                                    "rgba(56,189,248,0.15)",
                                  color: "#38BDF8",
                                }}
                              >
                                {i + 1}
                              </span>
                              <p
                                className="text-sm leading-relaxed"
                                style={{ color: "#EEEEFF" }}
                              >
                                {question.question}
                              </p>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {question.suggestions.map((suggestion) => {
                                const selected =
                                  currentAnswer.trim() === suggestion;
                                return (
                                  <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() =>
                                      applySuggestion(
                                        question.id,
                                        suggestion
                                      )
                                    }
                                    className="px-3 py-1.5 rounded-full text-xs transition-colors"
                                    style={{
                                      backgroundColor: selected
                                        ? "rgba(56,189,248,0.18)"
                                        : "#151524",
                                      border: selected
                                        ? "1px solid rgba(56,189,248,0.45)"
                                        : "1px solid #2E2E40",
                                      color: selected
                                        ? "#7DD3FC"
                                        : "#9494B8",
                                    }}
                                  >
                                    {suggestion}
                                  </button>
                                );
                              })}
                            </div>

                            <div
                              className="mt-3 rounded-xl overflow-hidden"
                              style={{
                                backgroundColor: "#12121A",
                                border: "1px solid #2E2E40",
                              }}
                            >
                              <textarea
                                rows={2}
                                value={currentAnswer}
                                onChange={(e) =>
                                  updateAnswer(
                                    question.id,
                                    e.target.value
                                  )
                                }
                                placeholder="Add your custom answer..."
                                className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none"
                                style={{ color: "#EEEEFF" }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div
                      className="mt-4 flex items-center justify-between gap-3"
                      style={{ borderTop: "1px solid #1C1C28", paddingTop: 14 }}
                    >
                      <p className="text-xs" style={{ color: "#6B6B8A" }}>
                        {unansweredCount > 0
                          ? `${unansweredCount} question(s) still missing`
                          : "All questions answered"}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void handleRefine();
                        }}
                        disabled={!canContinueToRefinement}
                        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                        style={{
                          backgroundColor: "#38BDF8",
                          color: "#09090E",
                        }}
                      >
                        {questionRound === 1
                          ? "Check MVP Readiness"
                          : "Re-check MVP Readiness"}
                      </button>
                      {canProceedWithAssumptions && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleRefine({ allowPartial: true });
                          }}
                          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                          style={{
                            backgroundColor: "rgba(129,140,248,0.18)",
                            border: "1px solid rgba(129,140,248,0.35)",
                            color: "#C7D2FE",
                          }}
                        >
                          Proceed with assumptions
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Refined debate */}
              {refinement &&
                (phase === "refined-debate" ||
                  phase === "proposal" ||
                  phase === "questions") && (
                  <div className="mb-8">
                    <p
                      className="text-xs font-semibold uppercase tracking-widest mb-4"
                      style={{ color: "#38BDF8" }}
                    >
                      Alignment Debate
                    </p>
                    <div
                      className="rounded-2xl p-5 flex flex-col gap-4 max-h-[420px] overflow-y-auto"
                      style={{
                        backgroundColor: "#0D0D15",
                        border: "1px solid #1C1C28",
                      }}
                    >
                      <AnimatePresence>
                        {refinement.refinedDebate
                          .slice(0, visibleRefinedMessages)
                          .map((msg, i) => {
                            const persona = getPersona(msg.personaId);
                            if (!persona) return null;
                            const isCS = msg.personaId === "customer_success";
                            return (
                              <motion.div
                                key={`refined_${i}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-start gap-3"
                              >
                                <div
                                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm"
                                  style={{
                                    backgroundColor: isCS
                                      ? "rgba(56,189,248,0.15)"
                                      : "#1C1C28",
                                  }}
                                >
                                  {persona.emoji}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span
                                    className="text-xs font-bold"
                                    style={{
                                      color: isCS ? "#38BDF8" : "#EEEEFF",
                                    }}
                                  >
                                    {persona.name}
                                  </span>
                                  <p
                                    className="text-sm leading-relaxed mt-1"
                                    style={{ color: "#9494B8" }}
                                  >
                                    {msg.message}
                                  </p>
                                </div>
                              </motion.div>
                            );
                          })}
                      </AnimatePresence>

                      {phase === "refined-debate" &&
                        visibleRefinedMessages < refinement.refinedDebate.length && (
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <motion.div
                                  key={i}
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: "#38BDF8" }}
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    delay: i * 0.2,
                                  }}
                                />
                              ))}
                            </div>
                            <span
                              className="text-xs"
                              style={{ color: "#6B6B8A" }}
                            >
                              Team is converging...
                            </span>
                          </div>
                        )}

                      <div ref={refinedDebateEndRef} />
                    </div>
                  </div>
                )}

              {/* MVP proposal */}
              {phase === "proposal" &&
                refinement?.readiness.readyForMvp &&
                refinement.mvpProposal && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-widest mb-4"
                      style={{ color: "#22C55E" }}
                    >
                      MVP Ready
                    </p>

                    <div
                      className="rounded-2xl p-6"
                      style={{
                        backgroundColor: "rgba(34,197,94,0.08)",
                        border: "1px solid rgba(34,197,94,0.2)",
                      }}
                    >
                      <h3
                        className="text-xl font-bold mb-2"
                        style={{ color: "#ECFDF5" }}
                      >
                        {refinement.mvpProposal.productName}
                      </h3>
                      <p className="text-sm mb-4" style={{ color: "#BBF7D0" }}>
                        {refinement.mvpProposal.oneLiner}
                      </p>
                      {refinement.depthProfile && (
                        <div
                          className="mb-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                          style={{
                            backgroundColor: "rgba(56,189,248,0.12)",
                            border: "1px solid rgba(56,189,248,0.3)",
                            color: "#BAE6FD",
                          }}
                        >
                          <span>
                            Depth tier: <strong>{refinement.depthProfile.tier}</strong>
                          </span>
                          <span>score {refinement.depthProfile.score}</span>
                        </div>
                      )}

                      <div className="grid gap-3 md:grid-cols-2 mb-5">
                        <div
                          className="rounded-xl p-4"
                          style={{
                            backgroundColor: "#0F1720",
                            border: "1px solid #1E293B",
                          }}
                        >
                          <p
                            className="text-xs uppercase tracking-wide mb-1"
                            style={{ color: "#38BDF8" }}
                          >
                            Estimated Build Cost
                          </p>
                          <p className="text-sm" style={{ color: "#E2E8F0" }}>
                            {refinement.mvpProposal.estimatedBuildCostUSD}
                          </p>
                        </div>
                        <div
                          className="rounded-xl p-4"
                          style={{
                            backgroundColor: "#0F1720",
                            border: "1px solid #1E293B",
                          }}
                        >
                          <p
                            className="text-xs uppercase tracking-wide mb-1"
                            style={{ color: "#38BDF8" }}
                          >
                            Estimated Monthly Cost
                          </p>
                          <p className="text-sm" style={{ color: "#E2E8F0" }}>
                            {refinement.mvpProposal.estimatedMonthlyCostUSD}
                          </p>
                        </div>
                      </div>

                      <div className="mb-5">
                        <p
                          className="text-xs font-semibold uppercase tracking-widest mb-2"
                          style={{ color: "#86EFAC" }}
                        >
                          Timeline
                        </p>
                        <p className="text-sm" style={{ color: "#D1FAE5" }}>
                          {refinement.mvpProposal.estimatedEffort}
                        </p>
                      </div>

                      <div className="mb-5">
                        <p
                          className="text-xs font-semibold uppercase tracking-widest mb-2"
                          style={{ color: "#86EFAC" }}
                        >
                          Must-have Features
                        </p>
                        <div className="flex flex-col gap-2">
                          {refinement.mvpProposal.coreFeatures
                            .filter((feature) => feature.priority === "must-have")
                            .map((feature, i) => (
                              <div
                                key={`${feature.name}_${i}`}
                                className="rounded-lg px-3 py-2"
                                style={{
                                  backgroundColor: "#111827",
                                  border: "1px solid #1F2937",
                                }}
                              >
                                <p
                                  className="text-sm font-semibold"
                                  style={{ color: "#F3F4F6" }}
                                >
                                  {feature.name}
                                </p>
                                <p
                                  className="text-xs mt-1"
                                  style={{ color: "#9CA3AF" }}
                                >
                                  {feature.description}
                                </p>
                              </div>
                          ))}
                        </div>
                      </div>

                      {refinement.mvpProposal.decisionLog.length > 0 && (
                        <div className="mb-5">
                          <p
                            className="text-xs font-semibold uppercase tracking-widest mb-2"
                            style={{ color: "#86EFAC" }}
                          >
                            Detailed Decisions
                          </p>
                          <div className="flex flex-col gap-3">
                            {refinement.mvpProposal.decisionLog.map(
                              (decision, i) => (
                                <div
                                  key={`${decision.title}_${i}`}
                                  className="rounded-xl p-4"
                                  style={{
                                    backgroundColor: "#0F172A",
                                    border: "1px solid #1E293B",
                                  }}
                                >
                                  <p
                                    className="text-sm font-semibold mb-2"
                                    style={{ color: "#E2E8F0" }}
                                  >
                                    {decision.title}
                                  </p>
                                  <p
                                    className="text-xs mb-2"
                                    style={{ color: "#CBD5E1" }}
                                  >
                                    <strong>Decision:</strong> {decision.decision}
                                  </p>
                                  <p
                                    className="text-xs mb-2"
                                    style={{ color: "#94A3B8" }}
                                  >
                                    <strong>Rationale:</strong> {decision.rationale}
                                  </p>
                                  {decision.alternativesConsidered.length > 0 && (
                                    <p
                                      className="text-xs mb-2"
                                      style={{ color: "#94A3B8" }}
                                    >
                                      <strong>Alternatives:</strong>{" "}
                                      {decision.alternativesConsidered.join(", ")}
                                    </p>
                                  )}
                                  {decision.tradeoffs && (
                                    <p
                                      className="text-xs mb-2"
                                      style={{ color: "#94A3B8" }}
                                    >
                                      <strong>Trade-offs:</strong> {decision.tradeoffs}
                                    </p>
                                  )}
                                  <div className="grid gap-2 md:grid-cols-3">
                                    <p
                                      className="text-xs"
                                      style={{ color: "#7DD3FC" }}
                                    >
                                      <strong>Cost:</strong>{" "}
                                      {decision.costImpact || "Not specified"}
                                    </p>
                                    <p
                                      className="text-xs"
                                      style={{ color: "#7DD3FC" }}
                                    >
                                      <strong>Timeline:</strong>{" "}
                                      {decision.timelineImpact || "Not specified"}
                                    </p>
                                    <p
                                      className="text-xs"
                                      style={{ color: "#7DD3FC" }}
                                    >
                                      <strong>Risk:</strong>{" "}
                                      {decision.riskImpact || "Not specified"}
                                    </p>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {refinement.mvpProposal.estimateAssumptions.length > 0 && (
                        <div className="mb-5">
                          <p
                            className="text-xs font-semibold uppercase tracking-widest mb-2"
                            style={{ color: "#86EFAC" }}
                          >
                            Estimate Assumptions
                          </p>
                          <ul className="flex flex-col gap-1">
                            {refinement.mvpProposal.estimateAssumptions.map(
                              (assumption, i) => (
                                <li
                                  key={`${assumption}_${i}`}
                                  className="text-xs"
                                  style={{ color: "#D1FAE5" }}
                                >
                                  • {assumption}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                      {refinement.nextActions.length > 0 && (
                        <div>
                          <p
                            className="text-xs font-semibold uppercase tracking-widest mb-2"
                            style={{ color: "#86EFAC" }}
                          >
                            Next Actions
                          </p>
                          <ol className="flex flex-col gap-1">
                            {refinement.nextActions.map((action, i) => (
                              <li
                                key={`${action}_${i}`}
                                className="text-xs"
                                style={{ color: "#D1FAE5" }}
                              >
                                {i + 1}. {action}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      <div
                        className="mt-5 rounded-lg px-3 py-2 text-xs"
                        style={{
                          backgroundColor: "rgba(56,189,248,0.08)",
                          border: "1px solid rgba(56,189,248,0.25)",
                          color: "#7DD3FC",
                        }}
                      >
                        Want changes? Send remarks in the input box below and
                        the team will re-discuss this MVP.
                      </div>
                    </div>
                  </motion.div>
                )}
            </div>
          )}
        </main>

        {notice && (
          <div className="px-6 pb-2">
            <p
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                backgroundColor: "rgba(56,189,248,0.08)",
                border: "1px solid rgba(56,189,248,0.25)",
                color: "#7DD3FC",
              }}
            >
              {notice}
            </p>
          </div>
        )}

        <div
          className="px-6 pb-4 pt-3"
          style={{
            borderTop: "1px solid #1C1C28",
            backgroundColor: "rgba(9,9,14,0.75)",
            backdropFilter: "blur(8px)",
          }}
        >
          <form onSubmit={handleComposerSubmit} className="w-full max-w-4xl mx-auto">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: "#12121A",
                border: "1px solid #2E2E40",
              }}
            >
              <textarea
                rows={2}
                value={composerInput}
                onChange={(e) => setComposerInput(e.target.value)}
                placeholder={composerPlaceholder}
                disabled={isComposerBusy}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none disabled:opacity-60"
                style={{ color: "#EEEEFF" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleComposerSubmit();
                  }
                }}
              />
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ borderTop: "1px solid #1C1C28" }}
              >
                <p className="text-xs" style={{ color: "#6B6B8A" }}>
                  {!analysis
                    ? "Start a new onboarding conversation"
                    : phase === "proposal"
                      ? "Send a remark to re-discuss this MVP"
                      : "Send context to the internal team"}
                </p>
                <button
                  type="submit"
                  disabled={!canSendComposer}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  style={{
                    backgroundColor: "#38BDF8",
                    color: "#09090E",
                  }}
                >
                  {composerActionLabel}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <style jsx global>{`
        @keyframes gradientShift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}</style>
    </div>
  );
}
