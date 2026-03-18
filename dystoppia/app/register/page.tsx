"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import NeuralTransition from "@/components/NeuralTransition";
import useAppStore from "@/store/useAppStore";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [confirmBorderError, setConfirmBorderError] = useState(false);

  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const xp = useAppStore((s) => s.xp);
  const streak = useAppStore((s) => s.streak);
  const sessionId = useAppStore((s) => s.sessionId);

  // Redirect if already logged in
  useEffect(() => {
    fetch("/api/auth/me").then((res) => {
      if (res.ok) router.replace("/");
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setConfirmBorderError(false);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedConfirm = confirmEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("That doesn't look like a valid email.");
      return;
    }

    if (trimmedEmail !== trimmedConfirm) {
      setError("Emails don't match. Try again.");
      setConfirmBorderError(true);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      if (!data.isNew) {
        setInfo("Email already registered — logging you in...");
      }

      setUser(data.id, data.email);
      setShowTransition(true);
      await new Promise((r) => setTimeout(r, 1200));
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const hasLocalData = xp > 0 || streak > 0;

  return (
    <>
      <NeuralTransition visible={showTransition} topic="Dystoppia" />

      <main
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: "#09090E" }}
      >
        {/* Background gradient */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center"
          >
            <h1
              className="text-5xl font-bold tracking-tight mb-2"
              style={{ color: "#EEEEFF" }}
            >
              Dystoppia
            </h1>
            <p className="text-sm" style={{ color: "#9494B8" }}>
              Your progress. Your universe.
            </p>
          </motion.div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="w-full rounded-2xl p-6 flex flex-col gap-5"
            style={{
              backgroundColor: "#12121A",
              border: "1px solid #2E2E40",
              boxShadow: "0 4px 40px rgba(0,0,0,0.4)",
            }}
          >
            {/* Value pills */}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {[
                { icon: "⚡", label: "XP" },
                { icon: "🔥", label: "Streaks" },
                { icon: "✦", label: "Adaptive AI" },
              ].map((pill) => (
                <span
                  key={pill.label}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: "rgba(129, 140, 248, 0.08)",
                    border: "1px solid rgba(129, 140, 248, 0.2)",
                    color: "#9494B8",
                  }}
                >
                  {pill.icon} {pill.label}
                </span>
              ))}
            </div>

            <div style={{ height: "1px", backgroundColor: "#2E2E40" }} />

            {/* Recovery banner */}
            <AnimatePresence>
              {hasLocalData && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{
                    backgroundColor: "rgba(56, 189, 248, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.2)",
                    color: "#38BDF8",
                  }}
                >
                  <span>✦</span>
                  <span>
                    Found a previous session
                    {xp > 0 ? ` with ${xp} XP` : ""}
                    {streak > 0 ? ` and a ${streak}-day streak` : ""}
                    — register to save it.
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                autoFocus
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none transition-all"
                style={{
                  border: "1px solid #2E2E40",
                  color: "#EEEEFF",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129, 140, 248, 0.5)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
              />

              <input
                type="email"
                value={confirmEmail}
                onChange={(e) => {
                  setConfirmEmail(e.target.value);
                  if (confirmBorderError) setConfirmBorderError(false);
                }}
                onPaste={(e) => e.preventDefault()}
                placeholder="Confirm your email"
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none transition-all"
                style={{
                  border: `1px solid ${confirmBorderError ? "#F97316" : "#2E2E40"}`,
                  color: "#EEEEFF",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
                onFocus={(e) => {
                  if (!confirmBorderError) e.currentTarget.style.borderColor = "rgba(129, 140, 248, 0.5)";
                }}
                onBlur={(e) => {
                  if (!confirmBorderError) e.currentTarget.style.borderColor = "#2E2E40";
                }}
              />

              {/* Error / info feedback */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: "rgba(249, 115, 22, 0.1)",
                      border: "1px solid rgba(249, 115, 22, 0.3)",
                      color: "#F97316",
                    }}
                  >
                    {error}
                  </motion.p>
                )}
                {info && !error && (
                  <motion.p
                    key="info"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs px-3 py-2 rounded-lg"
                    style={{
                      backgroundColor: "rgba(96, 165, 250, 0.1)",
                      border: "1px solid rgba(96, 165, 250, 0.3)",
                      color: "#60A5FA",
                    }}
                  >
                    {info}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: isLoading ? 1 : 1.02 }}
                whileTap={{ scale: isLoading ? 1 : 0.97 }}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
                style={{
                  backgroundColor: "#818CF8",
                  color: "white",
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                <AnimatePresence mode="wait">
                  {isLoading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="inline-flex items-center gap-2"
                    >
                      <span
                        className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin"
                        style={{ borderTopColor: "white" }}
                      />
                      Entering...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      Enter Dystoppia →
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </form>
          </motion.div>

          {/* Trust line */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs"
            style={{ color: "#9494B8" }}
          >
            No password needed. Just your email.
          </motion.p>
        </div>
      </main>
    </>
  );
}
