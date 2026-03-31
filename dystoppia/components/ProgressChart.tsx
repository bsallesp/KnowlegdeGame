"use client";

import { useEffect, useState } from "react";

interface ProgressEntry {
  date: string;
  correct: number;
  total: number;
  rate: number;
}

interface ProgressChartProps {
  topicId?: string;
  days?: number;
}

export default function ProgressChart({ topicId, days = 14 }: ProgressChartProps) {
  const [history, setHistory] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(false);
    const url = `/api/progress?days=${days}${topicId ? `&topicId=${topicId}` : ""}`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error("fetch failed"); return r.json(); })
      .then((d) => setHistory(d.history || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [topicId, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24" style={{ color: "#9494B8" }}>
        <span className="text-xs">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-24" style={{ color: "#F97316" }}>
        <span className="text-xs">Error loading history. Try again.</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-24" style={{ color: "#9494B8" }}>
        <span className="text-xs">No data yet. Answer a few questions!</span>
      </div>
    );
  }

  const maxTotal = Math.max(...history.map((h) => h.total), 1);
  const chartH = 80;
  const barW = Math.max(8, Math.min(24, Math.floor(300 / history.length) - 2));

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#9494B8" }}>
        History ({days} days)
      </p>
      <div className="flex items-end gap-1" style={{ height: `${chartH + 20}px` }}>
        {history.map((entry) => {
          const barHeight = Math.max(4, Math.round((entry.total / maxTotal) * chartH));
          const correctH = Math.round((entry.correct / Math.max(entry.total, 1)) * barHeight);
          const label = entry.date.slice(5); // MM-DD

          return (
            <div key={entry.date} className="flex flex-col items-center gap-1" style={{ width: `${barW}px` }} title={`${label}: ${entry.correct}/${entry.total} correct (${entry.rate}%)`}>
              <div
                className="w-full rounded-sm overflow-hidden flex flex-col justify-end"
                style={{ height: `${chartH}px`, backgroundColor: "#1C1C28" }}
              >
                {/* Correct portion */}
                <div
                  style={{
                    height: `${correctH}px`,
                    backgroundColor: entry.rate >= 70 ? "#60A5FA" : entry.rate >= 50 ? "#818CF8" : "#F97316",
                    transition: "height 0.5s ease",
                  }}
                />
              </div>
              <span className="text-xs" style={{ color: "#9494B8", fontSize: "9px", writingMode: "vertical-rl", transform: "rotate(180deg)", height: "20px" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        {[
          { color: "#60A5FA", label: "≥ 70%" },
          { color: "#818CF8", label: "50–69%" },
          { color: "#F97316", label: "< 50%" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color }} />
            <span className="text-xs" style={{ color: "#9494B8" }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

