"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useAppStore from "@/store/useAppStore";

export default function AchievementToast() {
  const { achievements, pendingAchievements, dismissAchievement } = useAppStore();

  const pending = pendingAchievements
    .map((id) => achievements.find((a) => a.id === id))
    .filter(Boolean);

  useEffect(() => {
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      dismissAchievement(pending[0]!.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pending, dismissAchievement]);

  const current = pending[0];

  return (
    <div className="fixed top-20 right-4 z-50 pointer-events-none">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9 }}
            transition={{ type: "spring", damping: 20 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
            style={{
              backgroundColor: "#1C1C28",
              border: "1px solid #818CF8",
              minWidth: "240px",
            }}
          >
            <span className="text-2xl">{current.icon}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#818CF8" }}>
                Achievement unlocked!
              </p>
              <p className="text-sm font-bold" style={{ color: "#EEEEFF" }}>{current.name}</p>
              <p className="text-xs" style={{ color: "#9494B8" }}>{current.description}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
