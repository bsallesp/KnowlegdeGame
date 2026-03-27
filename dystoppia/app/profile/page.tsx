"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRequireUser } from "@/lib/useRequireUser";
import useAppStore from "@/store/useAppStore";

interface UserProfile {
  goals: string[];
  knowledgeLevels: Record<string, number>;
  timePerSession: string;
  preferredLang: string;
}

export default function ProfilePage() {
  const { loading: authLoading } = useRequireUser();
  const router = useRouter();
  const userEmail = useAppStore((s) => s.userEmail);
  const weeklyRemaining = useAppStore((s) => s.weeklyRemaining);
  const weeklyUsage = useAppStore((s) => s.weeklyUsage);
  const plan = useAppStore((s) => s.plan);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => setProfile(data.profile))
      .catch(() => {});
  }, [authLoading]);

  if (authLoading) return null;

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  };

  const planLabel = plan === "pro" ? "Pro" : "Free";
  const planColor = plan === "pro" ? "#818CF8" : "#9494B8";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#09090E" }}>
      {/* Header */}
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
        <h1 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>Profile</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "#EEEEFF" }}>Profile</h2>
            <p className="text-sm mt-1" style={{ color: "#9494B8" }}>
              Your account details and learning preferences.
            </p>
          </div>

          {/* Account info */}
          <div
            className="rounded-xl p-6 space-y-4"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
          >
            <h3 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>Account</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#9494B8" }}>Email</span>
                <span className="text-sm font-medium" style={{ color: "#EEEEFF" }}>
                  {userEmail ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#9494B8" }}>Plan</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: plan === "pro" ? "rgba(129,140,248,0.15)" : "rgba(148,148,184,0.1)",
                    color: planColor,
                    border: `1px solid ${plan === "pro" ? "rgba(129,140,248,0.3)" : "#2E2E40"}`,
                  }}
                >
                  {planLabel}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#9494B8" }}>This week</span>
                <span className="text-sm font-medium" style={{ color: "#818CF8" }}>
                  {weeklyUsage} used · {weeklyRemaining} left
                </span>
              </div>
            </div>
          </div>

          {/* Learning preferences */}
          {profile && (
            <div
              className="rounded-xl p-6 space-y-4"
              style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>Learning Preferences</h3>

              <div className="space-y-3">
                {profile.timePerSession && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#9494B8" }}>Session duration</span>
                    <span className="text-sm" style={{ color: "#EEEEFF" }}>{profile.timePerSession}</span>
                  </div>
                )}

                {profile.preferredLang && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#9494B8" }}>Language</span>
                    <span className="text-sm" style={{ color: "#EEEEFF" }}>
                      {profile.preferredLang === "pt" ? "Portuguese" : profile.preferredLang === "en" ? "English" : profile.preferredLang}
                    </span>
                  </div>
                )}

                {profile.goals && profile.goals.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs" style={{ color: "#9494B8" }}>Goals</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {profile.goals.map((goal, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{
                            backgroundColor: "rgba(129,140,248,0.08)",
                            border: "1px solid rgba(129,140,248,0.2)",
                            color: "#818CF8",
                          }}
                        >
                          {goal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Logout */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full py-3 rounded-xl font-medium text-sm transition-all"
            style={{
              backgroundColor: "transparent",
              border: "1px solid rgba(249,115,22,0.3)",
              color: "#F97316",
              opacity: loggingOut ? 0.6 : 1,
            }}
          >
            {loggingOut ? "Signing out..." : "Sign out"}
          </motion.button>
        </motion.div>
      </main>
    </div>
  );
}
