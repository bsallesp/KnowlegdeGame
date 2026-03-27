"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import useAppStore from "@/store/useAppStore";

export default function BillingSuccessPage() {
  const setPlan = useAppStore((s) => s.setPlan);
  const setRateLimitState = useAppStore((s) => s.setRateLimitState);
  const setSubscriptionStatus = useAppStore((s) => s.setSubscriptionStatus);

  // Refresh user state from the server after successful checkout
  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.plan) setPlan(data.plan);
        if (data.subscriptionStatus) setSubscriptionStatus(data.subscriptionStatus);
        if (data.hourlyRemaining !== undefined) {
          setRateLimitState({
            hourlyUsage: data.hourlyUsage ?? 0,
            hourlyRemaining: data.hourlyRemaining ?? 30,
            hourlyResetsAt: data.hourlyResetsAt ?? null,
            weeklyUsage: data.weeklyUsage ?? 0,
            weeklyRemaining: data.weeklyRemaining ?? 250,
            weeklyResetsAt: data.weeklyResetsAt ?? null,
          });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: "#09090E" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22 }}
        className="text-center max-w-sm"
      >
        <div className="text-5xl mb-6">🎉</div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: "#EEEEFF" }}>
          You&apos;re in!
        </h1>
        <p className="text-sm mb-8" style={{ color: "#9494B8" }}>
          Your subscription is active. Go keep learning.
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-3 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#818CF8", color: "#09090E" }}
        >
          Back to learning
        </Link>
      </motion.div>
    </div>
  );
}
