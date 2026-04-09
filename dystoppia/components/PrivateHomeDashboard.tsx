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
}

interface DebateMessage {
  personaId: string;
  message: string;
  replyTo: string | null;
}

interface PersonaAnalysis {
  personas: Persona[];
  projectSummary: string;
  clarifyingQuestions: string[];
  initialDebate: DebateMessage[];
}

interface CoreFeature {
  name: string;
  description: string;
  priority: "must-have" | "should-have" | "nice-to-have";
  complexity: "low" | "medium" | "high";
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
  outOfScope: string[];
  estimatedEffort: string;
  businessModel: string;
  legalConsiderations: string[];
  teamRecommendation: string;
}

interface RefinementResult {
  refinedDebate: DebateMessage[];
  mvpProposal: MvpProposal;
  nextActions: string[];
}

interface Conversation {
  id: string;
  title: string;
  prompt: string;
  analysis: PersonaAnalysis | null;
  refinement: RefinementResult | null;
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

/* ── Conversation persistence ────────────────────────────────── */

const STORAGE_KEY = "dystoppia-conversations";

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
  const [userAnswers, setUserAnswers] = useState("");
  const [visiblePersonas, setVisiblePersonas] = useState(0);
  const [visibleDebate, setVisibleDebate] = useState(0);
  const [visibleRefinedDebate, setVisibleRefinedDebate] = useState(0);
  const [error, setError] = useState("");

  const debateEndRef = useRef<HTMLDivElement>(null);
  const refinedDebateEndRef = useRef<HTMLDivElement>(null);

  /* Load conversations from localStorage on mount */
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

  /* Persist conversations on change */
  useEffect(() => {
    if (conversations.length > 0) saveConversations(conversations);
  }, [conversations]);

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
        setPhase("proposal");
        updateConversation(activeId, { phase: "proposal" });
      }, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleRefinedDebate((v) => v + 1), 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visibleRefinedDebate, refinement]);

  /* Auto-scroll debate */
  useEffect(() => {
    debateEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleDebate, phase]);

  useEffect(() => {
    refinedDebateEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleRefinedDebate, phase]);

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
    setVisiblePersonas(0);
    setVisibleDebate(0);
    setError("");
  }

  function loadConversation(convo: Conversation) {
    setActiveId(convo.id);
    setPrompt(convo.prompt);
    setAnalysis(convo.analysis);
    setPhase(convo.analysis ? "questions" : "idle");
    setVisiblePersonas(convo.analysis?.personas.length ?? 0);
    setVisibleDebate(convo.analysis?.initialDebate.length ?? 0);
    setError("");
  }

  function deleteConversation(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (activeId === id) startNewConversation();
  }

  /* ── Submit ─────────────────────────────────────────────────── */

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const text = prompt.trim();
      if (!text || phase === "analyzing") return;

      // Create conversation
      const id = "conv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const convo: Conversation = {
        id,
        title: truncate(text, 60),
        prompt: text,
        analysis: null,
        phase: "analyzing",
        createdAt: new Date().toISOString(),
      };
      setConversations((prev) => [convo, ...prev]);
      setActiveId(id);

      setError("");
      setPhase("analyzing");
      setAnalysis(null);
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

        const data: PersonaAnalysis = await res.json();
        setAnalysis(data);
        setPhase("personas-revealed");

        // Persist to conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, analysis: data, phase: "personas-revealed" }
              : c
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setPhase("idle");
        // Remove failed conversation
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setActiveId(null);
      }
    },
    [prompt, phase]
  );

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

          {/* Results: personas + debate + questions */}
          {analysis && phase !== "idle" && phase !== "analyzing" && (
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
                      Before we move forward, the team has a few
                      questions:
                    </p>
                    <ol className="flex flex-col gap-2">
                      {analysis.clarifyingQuestions.map((q, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-sm"
                          style={{ color: "#EEEEFF" }}
                        >
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
                          <span className="leading-relaxed">{q}</span>
                        </li>
                      ))}
                    </ol>

                    <div
                      className="mt-4 rounded-xl overflow-hidden"
                      style={{
                        backgroundColor: "#12121A",
                        border: "1px solid #2E2E40",
                      }}
                    >
                      <textarea
                        rows={2}
                        placeholder="Answer the team's questions..."
                        className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none"
                        style={{ color: "#EEEEFF" }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </main>
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
