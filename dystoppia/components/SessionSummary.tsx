"use client";

import { motion } from "framer-motion";
import useAppStore from "@/store/useAppStore";

interface SessionSummaryProps {
  answerCount: number;
  correctCount: number;
  sessionXP: number;
  topicName: string;
  onContinue: () => void;
  onNewTopic: () => void;
}

export default function SessionSummary({
  answerCount,
  correctCount,
  sessionXP,
  topicName,
  onContinue,
  onNewTopic,
}: SessionSummaryProps) {
  const { achievements, subItemStats, streak, currentTopic } = useAppStore();

  const subItemNameMap = (currentTopic?.items ?? []).flatMap((i) => i.subItems).reduce<Record<string, string>>((acc, s) => {
    acc[s.id] = s.name;
    return acc;
  }, {});

  const rate = answerCount > 0 ? Math.round((correctCount / answerCount) * 100) : 0;
  const unlockedThisSession = achievements.filter(
    (a) =>
      a.unlockedAt &&
      Date.now() - new Date(a.unlockedAt).getTime() < 60 * 60 * 1000
  );

  // Weak sub-items: correctRate < 50%
  const weakSpots = Object.entries(subItemStats)
    .filter(([, s]) => s.totalCount >= 3 && s.correctCount / s.totalCount < 0.5)
    .sort(([, a], [, b]) => a.correctCount / a.totalCount - b.correctCount / b.totalCount)
    .slice(0, 3);

  const grade =
    rate >= 90 ? { label: "Excellent!", color: "#60A5FA", emoji: "🏆" }
    : rate >= 70 ? { label: "Very good!", color: "#818CF8", emoji: "⭐" }
    : rate >= 50 ? { label: "Good progress", color: "#FACC15", emoji: "📈" }
    : { label: "Keep practicing", color: "#F97316", emoji: "💪" };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(9,9,14,0.95)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22 }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        {/* Header */}
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="text-4xl mb-2">{grade.emoji}</div>
          <h2 className="text-xl font-bold mb-1" style={{ color: "#EEEEFF" }}>
            {grade.label}
          </h2>
          <p className="text-sm" style={{ color: "#9494B8" }}>{topicName}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px mx-6 mb-6" style={{ border: "1px solid #2E2E40", borderRadius: "12px", overflow: "hidden" }}>
          {[
            { label: "Answered", value: answerCount, color: "#EEEEFF" },
            { label: "Accuracy", value: `${rate}%`, color: grade.color },
            { label: "XP Gained", value: `+${sessionXP}`, color: "#FACC15" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-3" style={{ backgroundColor: "#1C1C28" }}>
              <span className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</span>
              <span className="text-xs" style={{ color: "#9494B8" }}>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Streak */}
        {streak > 0 && (
          <div className="mx-6 mb-4 flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)" }}>
            <span>🔥</span>
            <span className="text-sm font-semibold" style={{ color: "#F97316" }}>
              {streak} {streak === 1 ? "day" : "days"} streak!
            </span>
          </div>
        )}

        {/* Achievements */}
        {unlockedThisSession.length > 0 && (
          <div className="mx-6 mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#9494B8" }}>
              Session achievements
            </p>
            <div className="flex flex-wrap gap-2">
              {unlockedThisSession.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "rgba(129,140,248,0.15)", border: "1px solid #818CF8", color: "#818CF8" }}
                >
                  <span>{a.icon}</span>
                  <span>{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weak spots */}
        {weakSpots.length > 0 && (
          <div className="mx-6 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#9494B8" }}>
              Review more
            </p>
            <div className="space-y-1">
              {weakSpots.map(([id, s]) => (
                <div key={id} className="flex items-center justify-between px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
                  <span className="text-xs" style={{ color: "#F97316" }}>⚠ {subItemNameMap[id] ?? id}</span>
                  <span className="text-xs font-semibold" style={{ color: "#F97316" }}>
                    {Math.round((s.correctCount / s.totalCount) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onContinue}
            className="w-full py-3 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#818CF8", color: "white" }}
          >
            Keep practicing
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onNewTopic}
            className="w-full py-3 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#1C1C28", color: "#9494B8", border: "1px solid #2E2E40" }}
          >
            New topic
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

