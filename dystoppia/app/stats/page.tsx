"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRequireUser } from "@/lib/useRequireUser";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  totalCostUsd: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface EndpointRow {
  endpoint: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

interface ModelRow {
  model: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

interface DayRow {
  date: string;
  costUsd: number;
  calls: number;
}

interface RecentLog {
  id: string;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

interface StatsData {
  days: number;
  summary: Summary;
  byEndpoint: EndpointRow[];
  byModel: ModelRow[];
  byDay: DayRow[];
  recent: RecentLog[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

const ENDPOINT_LABELS: Record<string, string> = {
  "generate-questions": "Question Generation",
  "generate-questions-verify": "Answer Validation",
  "generate-structure": "Curriculum Builder",
  "hint": "Hint",
  "onboarding": "Onboarding",
  "audiobook": "Audiobook",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-opus-4-7": "Opus 4.7",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "openai-tts": "OpenAI TTS",
  "azure-tts": "Azure TTS",
};

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#F97316",
  "claude-opus-4-7": "#F97316",
  "claude-sonnet-4-6": "#818CF8",
  "claude-haiku-4-5": "#38BDF8",
  "claude-haiku-4-5-20251001": "#38BDF8",
  "openai-tts": "#34D399",
  "azure-tts": "#34D399",
};

function labelEndpoint(e: string) {
  return ENDPOINT_LABELS[e] ?? e;
}

function labelModel(m: string) {
  return MODEL_LABELS[m] ?? m;
}

function colorModel(m: string) {
  return MODEL_COLORS[m] ?? "#9494B8";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl px-5 py-4 flex flex-col gap-1"
      style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
    >
      <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#9494B8" }}>
        {label}
      </span>
      <span className="text-2xl font-bold tabular-nums" style={{ color: "#EEEEFF" }}>
        {value}
      </span>
      {sub && <span className="text-xs" style={{ color: "#9494B8" }}>{sub}</span>}
    </div>
  );
}

function DayBar({ day, maxCost, totalCalls }: { day: DayRow; maxCost: number; totalCalls: number }) {
  const heightPct = maxCost > 0 ? (day.costUsd / maxCost) * 100 : 0;
  const label = day.date.slice(5); // MM-DD

  return (
    <div className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
      {/* Tooltip */}
      <div
        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none"
      >
        <div
          className="rounded-md px-2 py-1.5 text-xs whitespace-nowrap"
          style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#EEEEFF" }}
        >
          <div className="font-semibold">{day.date}</div>
          <div style={{ color: "#FACC15" }}>{formatCost(day.costUsd)}</div>
          <div style={{ color: "#9494B8" }}>{day.calls} call{day.calls !== 1 ? "s" : ""}</div>
        </div>
        <div className="w-0 h-0" style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "4px solid #2E2E40" }} />
      </div>

      {/* Bar */}
      <div className="w-full flex items-end" style={{ height: "72px" }}>
        <div
          className="w-full rounded-t transition-all"
          style={{
            height: `${Math.max(heightPct, day.costUsd > 0 ? 3 : 0)}%`,
            backgroundColor: day.costUsd > 0 ? "#818CF8" : "#2E2E40",
            opacity: day.costUsd > 0 ? 0.8 : 0.3,
          }}
        />
      </div>

      {/* Label — only show every N-th to avoid clutter */}
      <span
        className="text-[10px] tabular-nums hidden sm:block"
        style={{ color: "#4A4A6A" }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const { loading: authLoading } = useRequireUser();
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async (d: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/llm-stats?days=${d}`);
      if (res.status === 401) { router.push("/"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as StatsData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!authLoading) void fetchStats(days);
  }, [authLoading, days, fetchStats]);

  if (authLoading) return null;

  const DAY_OPTIONS = [7, 30, 90];
  const maxDayCost = data ? Math.max(...data.byDay.map((d) => d.costUsd), 0.000001) : 1;
  const totalCost = data?.summary.totalCostUsd ?? 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#09090E", color: "#EEEEFF" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ backgroundColor: "#09090E", borderBottom: "1px solid #2E2E40" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-sm font-bold transition-colors"
            style={{ color: "#818CF8" }}
          >
            Dystoppia
          </button>
          <span style={{ color: "#2E2E40" }}>/</span>
          <span className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>LLM Stats</span>
        </div>

        {/* Day selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-colors"
              style={{
                backgroundColor: days === d ? "#818CF8" : "transparent",
                color: days === d ? "white" : "#9494B8",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-32"
            >
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="inline-block text-2xl"
              >
                ✦
              </motion.span>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32 gap-3"
            >
              <p style={{ color: "#F97316" }}>{error}</p>
              <button
                onClick={() => void fetchStats(days)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "#818CF8", color: "white" }}
              >
                Retry
              </button>
            </motion.div>
          ) : data ? (
            <motion.div
              key="data"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Total Cost"
                  value={formatCost(totalCost)}
                  sub={`last ${days} days`}
                />
                <MetricCard
                  label="API Calls"
                  value={formatNumber(data.summary.totalCalls)}
                  sub={data.summary.totalCalls > 0 ? `avg ${formatCost(totalCost / data.summary.totalCalls)}/call` : "—"}
                />
                <MetricCard
                  label="Input Tokens"
                  value={formatTokens(data.summary.totalInputTokens)}
                  sub="prompt tokens"
                />
                <MetricCard
                  label="Output Tokens"
                  value={formatTokens(data.summary.totalOutputTokens)}
                  sub="completion tokens"
                />
              </div>

              {/* Daily cost chart */}
              <div
                className="rounded-xl p-5"
                style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
                    Daily Cost
                  </h2>
                  <span className="text-xs" style={{ color: "#9494B8" }}>
                    peak {formatCost(maxDayCost)}/day
                  </span>
                </div>
                {data.byDay.every((d) => d.costUsd === 0) ? (
                  <p className="text-sm text-center py-8" style={{ color: "#4A4A6A" }}>
                    No data for this period
                  </p>
                ) : (
                  <div className="flex items-end gap-px">
                    {data.byDay.map((day) => (
                      <DayBar key={day.date} day={day} maxCost={maxDayCost} totalCalls={day.calls} />
                    ))}
                  </div>
                )}
              </div>

              {/* By Endpoint + By Model */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* By Endpoint */}
                <div
                  className="rounded-xl p-5"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                >
                  <h2 className="text-sm font-semibold mb-4" style={{ color: "#EEEEFF" }}>
                    Cost by Endpoint
                  </h2>
                  {data.byEndpoint.length === 0 ? (
                    <p className="text-sm" style={{ color: "#4A4A6A" }}>No data</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byEndpoint.map((row) => {
                        const pct = totalCost > 0 ? (row.costUsd / totalCost) * 100 : 0;
                        return (
                          <div key={row.endpoint}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm" style={{ color: "#C7C7E0" }}>
                                {labelEndpoint(row.endpoint)}
                              </span>
                              <div className="flex items-center gap-3 text-xs tabular-nums" style={{ color: "#9494B8" }}>
                                <span>{formatNumber(row.calls)} calls</span>
                                <span className="font-semibold" style={{ color: "#FACC15" }}>
                                  {formatCost(row.costUsd)}
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1C1C28" }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: "#818CF8" }}
                              />
                            </div>
                            <div className="flex justify-between mt-0.5 text-[10px]" style={{ color: "#4A4A6A" }}>
                              <span>{formatTokens(row.inputTokens)} in · {formatTokens(row.outputTokens)} out</span>
                              <span>{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* By Model */}
                <div
                  className="rounded-xl p-5"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                >
                  <h2 className="text-sm font-semibold mb-4" style={{ color: "#EEEEFF" }}>
                    Cost by Model
                  </h2>
                  {data.byModel.length === 0 ? (
                    <p className="text-sm" style={{ color: "#4A4A6A" }}>No data</p>
                  ) : (
                    <div className="space-y-4">
                      {data.byModel.map((row) => {
                        const pct = totalCost > 0 ? (row.costUsd / totalCost) * 100 : 0;
                        const color = colorModel(row.model);
                        return (
                          <div key={row.model}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="text-sm font-medium" style={{ color: "#C7C7E0" }}>
                                  {labelModel(row.model)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs tabular-nums" style={{ color: "#9494B8" }}>
                                <span>{formatNumber(row.calls)} calls</span>
                                <span className="font-semibold" style={{ color: "#FACC15" }}>
                                  {formatCost(row.costUsd)}
                                </span>
                              </div>
                            </div>
                            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#1C1C28" }}>
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
                              />
                            </div>
                            <div className="flex justify-between mt-0.5 text-[10px]" style={{ color: "#4A4A6A" }}>
                              <span>{formatTokens(row.inputTokens)} in · {formatTokens(row.outputTokens)} out</span>
                              <span>{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent calls */}
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: "1px solid #2E2E40" }}
              >
                <div
                  className="px-5 py-4 flex items-center justify-between"
                  style={{ backgroundColor: "#12121A", borderBottom: "1px solid #2E2E40" }}
                >
                  <h2 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
                    Recent Calls
                  </h2>
                  <span className="text-xs" style={{ color: "#9494B8" }}>
                    last {data.recent.length} shown
                  </span>
                </div>

                {data.recent.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm" style={{ color: "#4A4A6A", backgroundColor: "#12121A" }}>
                    No calls recorded yet
                  </div>
                ) : (
                  <div className="overflow-x-auto" style={{ backgroundColor: "#0D0D15" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1C1C28" }}>
                          {["Model", "Endpoint", "In", "Out", "Cost", "When"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider"
                              style={{ color: "#4A4A6A" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent.map((log, i) => (
                          <tr
                            key={log.id}
                            style={{
                              borderBottom: i < data.recent.length - 1 ? "1px solid #1C1C28" : "none",
                            }}
                          >
                            <td className="px-4 py-2.5">
                              <span
                                className="inline-flex items-center gap-1.5"
                                style={{ color: colorModel(log.model) }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: colorModel(log.model) }}
                                />
                                {labelModel(log.model)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5" style={{ color: "#9494B8" }}>
                              {labelEndpoint(log.endpoint)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums" style={{ color: "#C7C7E0" }}>
                              {formatTokens(log.inputTokens)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums" style={{ color: "#C7C7E0" }}>
                              {formatTokens(log.outputTokens)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: "#FACC15" }}>
                              {formatCost(log.costUsd)}
                            </td>
                            <td className="px-4 py-2.5" style={{ color: "#4A4A6A" }}>
                              {timeAgo(log.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
