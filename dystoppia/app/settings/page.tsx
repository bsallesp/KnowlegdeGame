"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";
import { useRequireUser } from "@/lib/useRequireUser";
import SettingsPanel from "@/components/SettingsPanel";

export default function SettingsPage() {
  const { loading: authLoading } = useRequireUser();
  const router = useRouter();
  const { currentTopic } = useAppStore();

  if (authLoading) return null;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#09090E" }}
    >
      <header
        className="flex items-center gap-3 px-6 py-4"
        style={{ backgroundColor: "#09090E", borderBottom: "1px solid #2E2E40" }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm transition-colors"
          style={{ color: "#9494B8" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span style={{ color: "#2E2E40" }}>/</span>
        <h1 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>Settings</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        <SettingsPanel />

        {currentTopic && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/session")}
            className="w-full mt-8 py-3 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#818CF8", color: "white" }}
          >
            Back to Learning Session
          </motion.button>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => router.push("/")}
          className="w-full mt-3 py-3 rounded-xl font-medium text-sm"
          style={{
            backgroundColor: "transparent",
            border: "1px solid #2E2E40",
            color: "#9494B8",
          }}
        >
          New Topic
        </motion.button>
      </main>
    </div>
  );
}
