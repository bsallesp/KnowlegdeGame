"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Topic } from "@/types";

interface TopicApprovalScreenProps {
  topic: Topic;
  onConfirm: (disabledItemIds: Set<string>) => void;
}

export default function TopicApprovalScreen({ topic, onConfirm }: TopicApprovalScreenProps) {
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeCount = topic.items.length - disabledIds.size;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "#09090E" }}
    >
      {/* Ambient gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #1E1E2E" }}
      >
        <span className="text-sm" style={{ color: "#9494B8" }}>
          Review your learning plan
        </span>
        <div
          className="px-3 py-1 rounded-lg text-xs font-semibold"
          style={{
            backgroundColor: "rgba(129, 140, 248, 0.1)",
            border: "1px solid rgba(129, 140, 248, 0.2)",
            color: "#818CF8",
          }}
        >
          {topic.name}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-auto px-4 py-6 flex flex-col items-center">
        <div className="w-full max-w-lg flex flex-col gap-6">
          {/* Title */}
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2" style={{ color: "#EEEEFF" }}>
              Here&apos;s your personalized plan
            </h2>
            <p className="text-sm" style={{ color: "#9494B8" }}>
              Remove topics you already know or don&apos;t need right now.
            </p>
          </div>

          {/* Items list */}
          <div className="flex flex-col gap-3">
            {topic.items.map((item) => {
              const isDisabled = disabledIds.has(item.id);
              return (
                <motion.button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full text-left p-4 rounded-xl transition-all"
                  style={{
                    backgroundColor: isDisabled ? "#0E0E18" : "#12121A",
                    border: isDisabled
                      ? "1px solid #2E2E40"
                      : "1px solid rgba(129, 140, 248, 0.3)",
                    opacity: isDisabled ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isDisabled ? "#4B4B6B" : "#EEEEFF" }}
                    >
                      {item.name}
                    </span>
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: isDisabled
                          ? "#1C1C28"
                          : "rgba(129, 140, 248, 0.15)",
                        border: isDisabled
                          ? "1px solid #2E2E40"
                          : "1px solid rgba(129, 140, 248, 0.4)",
                      }}
                    >
                      {!isDisabled && (
                        <span style={{ color: "#818CF8", fontSize: "10px" }}>✓</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.subItems.map((sub) => (
                      <span
                        key={sub.id}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: "#1C1C28",
                          color: "#4B4B6B",
                          border: "1px solid #2E2E40",
                        }}
                      >
                        {sub.name}
                      </span>
                    ))}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex flex-col items-center gap-3 pb-4">
            <p className="text-xs" style={{ color: "#4B4B6B" }}>
              {activeCount} of {topic.items.length} topics selected
            </p>
            <motion.button
              whileHover={activeCount > 0 ? { scale: 1.02 } : {}}
              whileTap={activeCount > 0 ? { scale: 0.98 } : {}}
              onClick={() => activeCount > 0 && onConfirm(disabledIds)}
              disabled={activeCount === 0}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{
                backgroundColor: activeCount > 0 ? "#818CF8" : "#1C1C28",
                color: activeCount > 0 ? "white" : "#4B4B6B",
                border: "none",
              }}
            >
              Start Learning →
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
