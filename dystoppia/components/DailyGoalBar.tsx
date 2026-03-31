"use client";

import { motion } from "framer-motion";
import useAppStore from "@/store/useAppStore";
import InfoButton from "@/components/InfoButton";

export default function DailyGoalBar() {
  const { dailyGoal } = useAppStore();

  const today = new Date().toISOString().split("T")[0];
  const progress = dailyGoal.date === today ? dailyGoal.progress : 0;
  const pct = Math.min(100, Math.round((progress / dailyGoal.target) * 100));
  const done = progress >= dailyGoal.target;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium" style={{ color: done ? "#60A5FA" : "#9494B8" }}>
        {done ? "🎖️" : "🎯"} {progress}/{dailyGoal.target}
      </span>
      <div
        className="w-16 h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: "#2E2E40" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: done ? "#60A5FA" : "#818CF8" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <InfoButton
        title="Daily Goal"
        content={`Your daily practice target: ${dailyGoal.target} questions. Complete it to build a consistent study habit. Adjust the target in Settings.`}
        side="below"
      />
    </div>
  );
}

