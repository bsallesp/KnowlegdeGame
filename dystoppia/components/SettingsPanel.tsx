"use client";

import { motion } from "framer-motion";
import useAppStore from "@/store/useAppStore";

interface SettingsPanelProps {
  /** Hide page-style title (use when the shell already shows "Settings", e.g. dialog header). */
  embedded?: boolean;
}

export default function SettingsPanel({ embedded = false }: SettingsPanelProps) {
  const { settings, setSettings } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "#EEEEFF" }}>Settings</h2>
          <p className="text-sm mt-1" style={{ color: "#9494B8" }}>
            Configure how Dystoppia generates and manages your question queue.
          </p>
        </div>
      )}
      {embedded && (
        <p className="text-sm" style={{ color: "#9494B8" }}>
          Configure how Dystoppia generates and manages your question queue.
        </p>
      )}

      <div
        className="rounded-xl p-6 space-y-4"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
              Queue Depth
            </h3>
            <p className="text-xs mt-1" style={{ color: "#9494B8" }}>
              How many questions to keep ready in the queue at all times.
            </p>
          </div>
          <span className="text-2xl font-bold" style={{ color: "#818CF8" }}>
            {settings.queueDepth}
          </span>
        </div>

        <input
          type="range"
          min={2}
          max={10}
          value={settings.queueDepth}
          onChange={(e) => setSettings({ queueDepth: parseInt(e.target.value) })}
          className="w-full accent-indigo-400"
          style={{ accentColor: "#818CF8" }}
        />

        <div className="flex justify-between text-xs" style={{ color: "#9494B8" }}>
          <span>2 (minimal)</span>
          <span>10 (large buffer)</span>
        </div>
      </div>

      <div
        className="rounded-xl p-6 space-y-4"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
              Refill Trigger
            </h3>
            <p className="text-xs mt-1" style={{ color: "#9494B8" }}>
              When the queue drops to this many questions, new ones are generated in the background.
            </p>
          </div>
          <span className="text-2xl font-bold" style={{ color: "#38BDF8" }}>
            {settings.refillTrigger}
          </span>
        </div>

        <input
          type="range"
          min={1}
          max={Math.max(settings.queueDepth - 1, 2)}
          value={settings.refillTrigger}
          onChange={(e) => setSettings({ refillTrigger: parseInt(e.target.value) })}
          className="w-full"
          style={{ accentColor: "#38BDF8" }}
        />

        <div className="flex justify-between text-xs" style={{ color: "#9494B8" }}>
          <span>1 (refill late)</span>
          <span>{Math.max(settings.queueDepth - 1, 2)} (refill early)</span>
        </div>
      </div>

      <div
        className="rounded-xl p-6 space-y-4"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
              Question Timer
            </h3>
            <p className="text-xs mt-1" style={{ color: "#9494B8" }}>
              Enable or disable the countdown timer for each question.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.timerEnabled}
            onClick={() => setSettings({ timerEnabled: !settings.timerEnabled })}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none"
            style={{
              backgroundColor: settings.timerEnabled ? "#818CF8" : "#2E2E40",
            }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200"
              style={{
                transform: settings.timerEnabled ? "translateX(1.375rem)" : "translateX(0.25rem)",
              }}
            />
          </button>
        </div>
      </div>

      <div
        className="rounded-xl p-4 flex gap-3"
        style={{
          backgroundColor: "rgba(129, 140, 248, 0.05)",
          border: "1px solid rgba(129, 140, 248, 0.2)",
        }}
      >
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#818CF8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>
          The adaptive algorithm automatically adjusts question difficulty based on your performance.
          Questions are cached in the database and reused when possible, reducing API calls.
          Difficulty scale: 1 (basic recall) → 5 (expert level synthesis).
        </p>
      </div>

      <div
        className="rounded-xl p-6 space-y-3"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
          Adaptive Algorithm
        </h3>
        <div className="space-y-2 text-xs" style={{ color: "#9494B8" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#60A5FA" }} />
            <span>Correct rate &ge; 80% over 3+ answers → difficulty increases</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F97316" }} />
            <span>Correct rate &lt; 50% → difficulty decreases</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#818CF8" }} />
            <span>SubItems not seen recently get higher priority</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FACC15" }} />
            <span>Muted SubItems are excluded from the queue</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
