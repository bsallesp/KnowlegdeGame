"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useAppStore from "@/store/useAppStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");

  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    fetch("/api/auth/me").then((res) => {
      if (res.ok) router.replace("/");
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setUnverifiedEmail("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(data.email);
        } else {
          setError(data.error || "Invalid email or password.");
        }
        return;
      }

      setUser(data.id, data.email);
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unverifiedEmail }),
    });
    router.push(`/register?email=${encodeURIComponent(unverifiedEmail)}&step=verify`);
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "#09090E" }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-5xl font-bold tracking-tight mb-2" style={{ color: "#EEEEFF" }}>
            Dystoppia
          </h1>
          <p className="text-sm" style={{ color: "#9494B8" }}>
            Welcome back
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", boxShadow: "0 4px 40px rgba(0,0,0,0.4)" }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "#9494B8" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
                style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: "#9494B8" }}>Password</label>
                <Link href="/forgot-password" className="text-xs" style={{ color: "#9494B8" }}>
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 pr-10 rounded-xl text-sm bg-transparent outline-none"
                  style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: "#4B4B6B" }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}
                >
                  {error}
                </motion.p>
              )}
              {unverifiedEmail && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs px-3 py-2.5 rounded-lg flex flex-col gap-2"
                  style={{ backgroundColor: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", color: "#38BDF8" }}
                >
                  <span>Your email isn&apos;t verified yet.</span>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="underline text-left"
                  >
                    Resend verification code →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: isLoading ? 1 : 1.02 }}
              whileTap={{ scale: isLoading ? 1 : 0.97 }}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ backgroundColor: "#818CF8", color: "white", opacity: isLoading ? 0.7 : 1 }}
            >
              {isLoading ? "Signing in..." : "Sign in →"}
            </motion.button>

            <p className="text-center text-xs" style={{ color: "#4B4B6B" }}>
              Don&apos;t have an account?{" "}
              <Link href="/register" className="underline" style={{ color: "#9494B8" }}>
                Create one
              </Link>
            </p>
          </form>
        </motion.div>
      </div>
    </main>
  );
}
