"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Question } from "@/types";

interface ConveyorBeltProps {
  queue: Question[];
  currentQuestion: Question | null;
  isGenerating: boolean;
}

function QueueCard({ question, index }: { question: Question; index: number }) {
  const typeColors: Record<string, string> = {
    multiple_choice: "#818CF8",
    single_choice: "#38BDF8",
    fill_blank: "#60A5FA",
    true_false: "#FACC15",
  };

  const typeLabels: Record<string, string> = {
    multiple_choice: "MC",
    single_choice: "SC",
    fill_blank: "FB",
    true_false: "TF",
  };

  const color = typeColors[question.type] || "#818CF8";
  const label = typeLabels[question.type] || "Q";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, x: 40 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: -40 }}
      transition={{ delay: index * 0.05 }}
      className="flex-shrink-0 rounded-lg p-2 flex flex-col items-center gap-1"
      style={{
        width: "56px",
        backgroundColor: "#1C1C28",
        border: `1px solid ${color}33`,
      }}
      title={question.subItem?.name || "Question"}
    >
      <div
        className="text-xs font-bold px-1.5 py-0.5 rounded"
        style={{ backgroundColor: color + "22", color }}
      >
        {label}
      </div>
      <div
        className="w-full h-1 rounded-full"
        style={{ backgroundColor: color + "44" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, question.difficulty * 20)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <motion.div
      className="flex-shrink-0 rounded-lg"
      style={{
        width: "56px",
        height: "52px",
        backgroundColor: "#1C1C28",
        border: "1px solid #2E2E40",
      }}
      animate={{ opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity }}
    />
  );
}

export default function ConveyorBelt({ queue, currentQuestion, isGenerating }: ConveyorBeltProps) {
  return (
    <div
      className="w-full px-4 py-3 flex items-center gap-2"
      style={{
        backgroundColor: "#12121A",
        borderBottom: "1px solid #2E2E40",
      }}
    >
      {/* Current indicator */}
      <div
        className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded"
        style={{ color: "#9494B8", backgroundColor: "#1C1C28" }}
      >
        Now
      </div>

      {/* Current question indicator */}
      {currentQuestion ? (
        <motion.div
          className="flex-shrink-0 rounded-lg p-2 flex items-center justify-center"
          style={{
            width: "56px",
            height: "52px",
            backgroundColor: "#818CF8",
            boxShadow: "0 0 12px rgba(129, 140, 248, 0.4)",
          }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </motion.div>
      ) : (
        <SkeletonCard />
      )}

      {/* Arrow */}
      <div style={{ color: "#2E2E40" }}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* Queue label */}
      <div
        className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded"
        style={{ color: "#9494B8", backgroundColor: "#1C1C28" }}
      >
        Up next
      </div>

      {/* Queue cards */}
      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <AnimatePresence mode="popLayout">
          {queue.map((q, i) => (
            <QueueCard key={q.id} question={q} index={i} />
          ))}
        </AnimatePresence>

        {isGenerating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-shrink-0 flex items-center gap-1 px-3 rounded-lg"
            style={{
              backgroundColor: "#1C1C28",
              border: "1px solid #818CF833",
            }}
          >
            <motion.div
              className="flex gap-1"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "#818CF8" }}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Queue depth indicator */}
      <div className="ml-auto flex-shrink-0 flex items-center gap-1">
        <span className="text-xs" style={{ color: "#9494B8" }}>
          {queue.length}
        </span>
        <div className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1.5 h-3 rounded-sm"
              style={{
                backgroundColor: i < queue.length ? "#818CF8" : "#2E2E40",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
