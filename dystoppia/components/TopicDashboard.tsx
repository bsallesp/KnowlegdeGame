"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { isItemSoloActive, isSubItemSoloActive } from "@/lib/topicFocus";
import type { Item } from "@/types";

interface TopicDashboardProps {
  items: Item[];
  subItemStats: Record<string, { correctCount: number; totalCount: number; difficulty: number }>;
  onToggleMute: (id: string, type: "item" | "subitem") => void;
  onSolo?: (id: string, type: "item" | "subitem") => void;
  onOpenAudiobooks?: (id: string, type: "item" | "subitem", label: string) => void;
}

const PROFICIENCY_LABELS = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"];

function ProgressBar({ correctCount, totalCount }: { correctCount: number; totalCount: number }) {
  const correctPct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
  const wrongPct = totalCount > 0 ? ((totalCount - correctCount) / totalCount) * 100 : 0;

  return (
    <div
      className="w-full h-1.5 rounded-full overflow-hidden mt-1"
      data-testid="topic-progress-bar"
      style={{ backgroundColor: "#2E2E40" }}
      title={`${correctCount}/${totalCount} correct`}
    >
      <div className="h-full flex">
        <motion.div
          className="h-full"
          style={{ backgroundColor: "#60A5FA" }}
          initial={{ width: 0 }}
          animate={{ width: `${correctPct}%` }}
          transition={{ duration: 0.5 }}
        />
        <motion.div
          className="h-full"
          style={{ backgroundColor: "#F97316" }}
          initial={{ width: 0 }}
          animate={{ width: `${wrongPct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

function MuteIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  );
}

function DifficultyDots({ level }: { level: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((d) => (
        <div
          key={d}
          className="w-1.5 h-1.5 rounded-full"
          data-testid="topic-difficulty-dot"
          style={{
            backgroundColor: d <= level ? "#818CF8" : "#2E2E40",
          }}
        />
      ))}
    </div>
  );
}

function SoloBadge({ active }: { active: boolean }) {
  return (
    <span
      className="text-[0.55rem] font-semibold tracking-[0.2em]"
      style={{ color: active ? "#FACC15" : "#9494B8" }}
    >
      SOLO
    </span>
  );
}

export default function TopicDashboard({ items, subItemStats, onToggleMute, onSolo, onOpenAudiobooks }: TopicDashboardProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    items.reduce((acc, item) => ({ ...acc, [item.id]: true }), {})
  );

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Expand newly added items automatically
  const ensureExpanded = (itemId: string) => {
    if (expandedItems[itemId] === undefined) {
      setExpandedItems((prev) => ({ ...prev, [itemId]: true }));
    }
  };

  return (
    <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
      <AnimatePresence initial={false}>
        {items.map((item, itemIndex) => {
          ensureExpanded(item.id);
          const isExpanded = expandedItems[item.id] !== false;
          const itemSoloActive = isItemSoloActive(items, item.id);

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: itemIndex * 0.08, duration: 0.35 }}
            >
              {/* Item header */}
              <div
                className="flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer group"
                style={{
                  backgroundColor: item.muted ? "transparent" : "#1C1C28",
                  opacity: item.muted ? 0.5 : 1,
                }}
              >
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <motion.span
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ color: "#9494B8" }}
                    className="flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.span>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide truncate"
                    style={{ color: "#9494B8" }}
                  >
                    {item.name}
                  </span>
                </button>
                {onOpenAudiobooks && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenAudiobooks(item.id, "item", item.name); }}
                    className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#818CF8" }}
                    title="Audiobooks for this chapter"
                    aria-label="Open chapter audiobooks"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18v-6a9 9 0 0118 0v6" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
                    </svg>
                  </button>
                )}
                {onSolo && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSolo(item.id, "item"); }}
                    className="flex-shrink-0 px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      backgroundColor: itemSoloActive ? "rgba(250,204,21,0.14)" : "transparent",
                      border: `1px solid ${itemSoloActive ? "rgba(250,204,21,0.35)" : "#2E2E40"}`,
                    }}
                    title={itemSoloActive ? "Show all chapters again" : "Solo this chapter"}
                    aria-label={itemSoloActive ? "Exit item solo" : "Solo item"}
                  >
                    <SoloBadge active={itemSoloActive} />
                  </button>
                )}
                <button
                  onClick={() => onToggleMute(item.id, "item")}
                  className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: item.muted ? "#F97316" : "#9494B8" }}
                  title={item.muted ? "Unmute" : "Mute"}
                  aria-label={item.muted ? "Unmute item" : "Mute item"}
                >
                  <MuteIcon muted={item.muted} />
                </button>
              </div>

              {/* SubItems */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {item.subItems.map((sub, subIndex) => {
                      const stats = subItemStats[sub.id];
                      const totalCount = stats?.totalCount || 0;
                      const correctCount = stats?.correctCount || 0;
                      const difficulty = stats?.difficulty || sub.difficulty || 1;
                      const proficiencyLabel = PROFICIENCY_LABELS[difficulty] || "Beginner";
                      const subItemSoloActive = isSubItemSoloActive(items, sub.id);

                      return (
                        <motion.div
                          key={sub.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: subIndex * 0.04 }}
                          className="ml-4 mb-1 group"
                        >
                          {/* Weak spot / mastery indicator */}
                          {(() => {
                            const rate = stats && stats.totalCount >= 3 ? stats.correctCount / stats.totalCount : null;
                            const isWeak = rate !== null && rate < 0.5;
                            const isMastered = rate !== null && rate >= 0.8 && stats!.totalCount >= 10;
                            const borderColor = sub.muted ? "#2E2E40" : isWeak ? "#F97316" : isMastered ? "#60A5FA" : "#818CF8";
                            return (
                          <div
                            className="flex items-start gap-2 px-3 py-2 rounded-lg"
                            style={{
                              backgroundColor: sub.muted ? "transparent" : isWeak ? "rgba(249,115,22,0.05)" : "rgba(28,28,40,0.5)",
                              opacity: sub.muted ? 0.4 : 1,
                              borderLeft: `2px solid ${borderColor}`,
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start flex-col gap-1">
                                <span
                                  className="text-xs"
                                  style={{ color: sub.muted ? "#9494B8" : "#EEEEFF", wordBreak: "break-word" }}
                                >
                                  {(() => {
                                    const rate = stats && stats.totalCount >= 3 ? stats.correctCount / stats.totalCount : null;
                                    if (rate !== null && rate < 0.5) return "⚠ ";
                                    if (rate !== null && rate >= 0.8 && stats!.totalCount >= 10) return "✓ ";
                                    return "";
                                  })()}{sub.name}
                                </span>
                                <div className="flex items-center gap-1 mt-1">
                                  {onOpenAudiobooks && (
                                    <button
                                      onClick={() => onOpenAudiobooks(sub.id, "subitem", sub.name)}
                                      className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      style={{ color: "#818CF8" }}
                                      title="Audiobooks for this concept"
                                      aria-label="Open concept audiobooks"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18v-6a9 9 0 0118 0v6" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
                                      </svg>
                                    </button>
                                  )}
                                  {onSolo && (
                                    <button
                                      onClick={() => onSolo(sub.id, "subitem")}
                                      className="flex-shrink-0 px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      style={{
                                        backgroundColor: subItemSoloActive ? "rgba(250,204,21,0.14)" : "transparent",
                                        border: `1px solid ${subItemSoloActive ? "rgba(250,204,21,0.35)" : "#2E2E40"}`,
                                      }}
                                      title={subItemSoloActive ? "Show all concepts again" : "Solo this concept"}
                                      aria-label={subItemSoloActive ? "Exit subitem solo" : "Solo subitem"}
                                    >
                                      <SoloBadge active={subItemSoloActive} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => onToggleMute(sub.id, "subitem")}
                                    className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ color: sub.muted ? "#F97316" : "#9494B8" }}
                                    title={sub.muted ? "Unmute" : "Mute"}
                                    aria-label={sub.muted ? "Unmute subitem" : "Mute subitem"}
                                  >
                                    <MuteIcon muted={sub.muted} />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <DifficultyDots level={difficulty} />
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: "#818CF8", fontSize: "0.6rem" }}
                                >
                                  {proficiencyLabel}
                                </span>
                                {totalCount > 0 && (
                                  <span className="text-xs ml-auto" style={{ color: "#9494B8" }}>
                                    {correctCount}/{totalCount}
                                  </span>
                                )}
                              </div>
                              {totalCount > 0 && (
                                <ProgressBar correctCount={correctCount} totalCount={totalCount} />
                              )}
                            </div>
                          </div>
                            );
                          })()}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
