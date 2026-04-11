"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";
import { useCheckUser } from "@/lib/useCheckUser";

const GED_SLUG = "ged-mathematical-reasoning";

export default function RootPage() {
  const { loading } = useCheckUser();
  const router = useRouter();
  const { _hasHydrated, setCurrentTopic, resetSession } = useAppStore();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const autoStartedRef = useRef(false);

  async function startGed() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/topics?slug=${encodeURIComponent(GED_SLUG)}`);
      if (!res.ok) throw new Error("Could not load GED topic");
      const topic = await res.json();
      resetSession();
      setCurrentTopic(topic);
      router.push("/session");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStarting(false);
    }
  }

  // Auto-start when ready — one-click landing
  useEffect(() => {
    if (loading || !_hasHydrated || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startGed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, _hasHydrated]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "#09090E" }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-xl flex flex-col items-center gap-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h1 className="text-5xl font-bold tracking-tight mb-2" style={{ color: "#EEEEFF" }}>
            GED Math Trainer
          </h1>
          <p className="text-sm" style={{ color: "#9494B8" }}>
            Adaptive practice for the GED Mathematical Reasoning test
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onClick={startGed}
          disabled={starting || loading || !_hasHydrated}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-8 py-4 rounded-xl font-semibold text-base transition-all"
          style={{
            backgroundColor: "#818CF8",
            color: "white",
            border: "none",
            opacity: starting || loading || !_hasHydrated ? 0.6 : 1,
          }}
        >
          {starting || loading || !_hasHydrated ? "Loading..." : "Start Training"}
        </motion.button>

        {error && (
          <p
            className="text-sm px-4 py-2 rounded-lg"
            style={{
              backgroundColor: "rgba(249, 115, 22, 0.1)",
              border: "1px solid rgba(249, 115, 22, 0.3)",
              color: "#F97316",
            }}
          >
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
