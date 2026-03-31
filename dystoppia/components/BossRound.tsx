"use client";

import { motion } from "framer-motion";

interface BossRoundProps {
  onReady: () => void;
  isLoading?: boolean;
}

export default function BossRound({ onReady, isLoading }: BossRoundProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: "rgba(9,9,14,0.97)", backdropFilter: "blur(12px)" }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 16, delay: 0.1 }}
        className="flex flex-col items-center gap-6 text-center px-8"
      >
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-7xl"
        >
          ⚔️
        </motion.div>

        <div>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-black mb-2"
            style={{ color: "#EF4444" }}
          >
            BOSS ROUND
          </motion.h2>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-base"
            style={{ color: "#9494B8" }}
          >
            Get ready! The next 3 questions are maximum difficulty.
          </motion.p>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex gap-4 text-sm"
          style={{ color: "#9494B8" }}
        >
          <div className="flex items-center gap-1">
            <span style={{ color: "#FACC15" }}>⚡</span> 2× XP
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: "#EF4444" }}>💀</span> Maximum difficulty
          </div>
        </motion.div>

        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          whileHover={isLoading ? {} : { scale: 1.05 }}
          whileTap={isLoading ? {} : { scale: 0.95 }}
          onClick={isLoading ? undefined : onReady}
          disabled={isLoading}
          className="px-10 py-3 rounded-xl font-bold text-sm"
          style={{ backgroundColor: "#EF4444", color: "white", opacity: isLoading ? 0.7 : 1, cursor: isLoading ? "not-allowed" : "pointer" }}
        >
          {isLoading ? "Generating..." : "Face the Boss →"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

