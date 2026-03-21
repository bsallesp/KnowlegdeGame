"use client";

import { motion } from "framer-motion";
import type { SubItem } from "@/types";

interface FlashCardProps {
  subItem: SubItem;
  topicName: string;
  onReady: () => void;
}

export default function FlashCard({ subItem, topicName, onReady }: FlashCardProps) {
  const difficultyLabel = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"][subItem.difficulty] || "Intermediate";
  const difficultyColor = ["", "#60A5FA", "#38BDF8", "#818CF8", "#F97316", "#EF4444"][subItem.difficulty] || "#818CF8";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#9494B8" }}>
          {topicName}
        </p>
        <h2 className="text-2xl font-bold mb-4" style={{ color: "#EEEEFF" }}>
          {subItem.name}
        </h2>
        <span
          className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-6"
          style={{ backgroundColor: `${difficultyColor}22`, color: difficultyColor, border: `1px solid ${difficultyColor}44` }}
        >
          {difficultyLabel}
        </span>

        <p className="text-sm mb-8" style={{ color: "#9494B8" }}>
          Ready to answer questions about this concept?
        </p>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onReady}
          className="px-8 py-3 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#818CF8", color: "white" }}
        >
          Let's go →
        </motion.button>
      </div>
    </motion.div>
  );
}

