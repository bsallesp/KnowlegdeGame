"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useAppStore from "@/store/useAppStore";

type Step = "email" | "code" | "password";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      // Always advance — anti-enumeration
      setStep("code");
      setResendCooldown(60);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) setStep("password");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed.");
        if (data.error?.includes("Code") || data.error?.includes("code")) {
          setStep("code");
          setCode("");
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

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    setResendCooldown(60);
  };

  const stepIndex = { email: 0, code: 1, password: 2 }[step];

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
          <p className="text-sm" style={{ color: "#9494B8" }}>Reset your password</p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {["Email", "Code", "Password"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: i <= stepIndex ? "#818CF8" : "#2E2E40",
                    color: i <= stepIndex ? "white" : "#4B4B6B",
                  }}
                >
                  {i < stepIndex ? "✓" : i + 1}
                </div>
                <span className="text-xs" style={{ color: i <= stepIndex ? "#9494B8" : "#4B4B6B" }}>{label}</span>
              </div>
              {i < 2 && <div className="w-6 h-px" style={{ backgroundColor: i < stepIndex ? "#818CF8" : "#2E2E40" }} />}
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full rounded-2xl p-6"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", boxShadow: "0 4px 40px rgba(0,0,0,0.4)" }}
        >
          <AnimatePresence mode="wait">
            {step === "email" && (
              <motion.form
                key="email"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSendCode}
                className="flex flex-col gap-4"
              >
                <p className="text-sm" style={{ color: "#9494B8" }}>
                  Enter your email and we&apos;ll send you a reset code.
                </p>
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
                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-xs px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}
                    >{error}</motion.p>
                  )}
                </AnimatePresence>
                <motion.button type="submit" disabled={isLoading}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white", opacity: isLoading ? 0.7 : 1 }}
                >
                  {isLoading ? "Sending..." : "Send reset code →"}
                </motion.button>
              </motion.form>
            )}

            {step === "code" && (
              <motion.form
                key="code"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleVerifyCode}
                className="flex flex-col gap-4"
              >
                <div className="text-center">
                  <p className="text-sm" style={{ color: "#9494B8" }}>
                    If <span className="font-semibold" style={{ color: "#EEEEFF" }}>{email}</span> is registered, a code was sent.
                  </p>
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
                  className="w-full px-4 py-4 rounded-xl text-center text-2xl font-bold bg-transparent outline-none"
                  style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)", letterSpacing: "0.3em" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
                />
                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-xs px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}
                    >{error}</motion.p>
                  )}
                </AnimatePresence>
                <motion.button type="submit" disabled={code.length < 6}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white", opacity: code.length < 6 ? 0.5 : 1 }}
                >
                  Continue →
                </motion.button>
                <div className="flex items-center justify-between text-xs" style={{ color: "#4B4B6B" }}>
                  <button type="button" onClick={() => { setStep("email"); setError(""); }} style={{ color: "#9494B8" }}>← Back</button>
                  <button type="button" onClick={handleResend} disabled={resendCooldown > 0} style={{ color: resendCooldown > 0 ? "#4B4B6B" : "#9494B8" }}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </motion.form>
            )}

            {step === "password" && (
              <motion.form
                key="password"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleResetPassword}
                className="flex flex-col gap-3"
              >
                <p className="text-sm" style={{ color: "#9494B8" }}>Choose a new password.</p>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password (min. 8 chars)"
                    required
                    autoFocus
                    disabled={isLoading}
                    className="w-full px-4 py-3 pr-10 rounded-xl text-sm bg-transparent outline-none"
                    style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#4B4B6B" }}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  disabled={isLoading}
                  className="w-full px-4 py-3 rounded-xl text-sm bg-transparent outline-none"
                  style={{ border: "1px solid #2E2E40", color: "#EEEEFF", backgroundColor: "rgba(255,255,255,0.02)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.5)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2E2E40")}
                />
                <AnimatePresence>
                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-xs px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}
                    >{error}</motion.p>
                  )}
                </AnimatePresence>
                <motion.button type="submit" disabled={isLoading}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white", opacity: isLoading ? 0.7 : 1 }}
                >
                  {isLoading ? "Saving..." : "Set new password →"}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <Link href="/login" className="text-xs" style={{ color: "#4B4B6B" }}>
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
