"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useAppStore from "@/store/useAppStore";

type Step = "form" | "verify";

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    fetch("/api/auth/me").then((res) => {
      if (res.ok) router.replace("/");
    });
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setStep("verify");
      setResendCooldown(60);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed.");
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

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError("");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setResendCooldown(60);
    } catch {
      setError("Failed to resend. Try again.");
    }
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
            {step === "form" ? "Create your account" : "Check your inbox"}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full rounded-2xl p-6 flex flex-col gap-5"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", boxShadow: "0 4px 40px rgba(0,0,0,0.4)" }}
        >
          <AnimatePresence mode="wait">
            {step === "form" ? (
              <motion.form
                key="form"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleRegister}
                className="flex flex-col gap-3"
              >
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
                  <label className="text-xs font-medium" style={{ color: "#9494B8" }}>Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
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

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: "#9494B8" }}>Confirm password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    required
                    disabled={isLoading}
                    className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
                    style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
                  />
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
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: isLoading ? 1 : 1.02 }}
                  whileTap={{ scale: isLoading ? 1 : 0.97 }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white", opacity: isLoading ? 0.7 : 1 }}
                >
                  {isLoading ? "Creating account..." : "Create account →"}
                </motion.button>

                <p className="text-center text-xs" style={{ color: "#4B4B6B" }}>
                  Already have an account?{" "}
                  <Link href="/login" className="underline" style={{ color: "#9494B8" }}>
                    Sign in
                  </Link>
                </p>
              </motion.form>
            ) : (
              <motion.form
                key="verify"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleVerify}
                className="flex flex-col gap-4"
              >
                <div className="text-center">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)" }}
                  >
                    <svg className="w-6 h-6" style={{ color: "#818CF8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: "#9494B8" }}>
                    We sent a 6-digit code to
                  </p>
                  <p className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>{email}</p>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  autoFocus
                  disabled={isLoading}
                  className="w-full px-4 py-4 rounded-xl text-center text-2xl font-bold tracking-widest bg-transparent outline-none"
                  style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)", letterSpacing: "0.3em" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
                />

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
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={isLoading || code.length < 6}
                  whileHover={{ scale: isLoading ? 1 : 1.02 }}
                  whileTap={{ scale: isLoading ? 1 : 0.97 }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white", opacity: isLoading || code.length < 6 ? 0.5 : 1 }}
                >
                  {isLoading ? "Verifying..." : "Verify email →"}
                </motion.button>

                <div className="flex items-center justify-between text-xs" style={{ color: "#4B4B6B" }}>
                  <button type="button" onClick={() => { setStep("form"); setError(""); setCode(""); }} style={{ color: "#9494B8" }}>
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    style={{ color: resendCooldown > 0 ? "#4B4B6B" : "#9494B8" }}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <p className="text-xs" style={{ color: "#4B4B6B" }}>
          By creating an account you agree to our terms of service.
        </p>
      </div>
    </main>
  );
}
