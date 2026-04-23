"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import useAppStore from "@/store/useAppStore";

export default function BillingSuccessPage() {
  const setPlan = useAppStore((s) => s.setPlan);
  const setRateLimitState = useAppStore((s) => s.setRateLimitState);
  const setSubscriptionStatus = useAppStore((s) => s.setSubscriptionStatus);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  // Refresh user state from the server after successful checkout
  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.plan) setPlan(data.plan);
        if (data.subscriptionStatus) setSubscriptionStatus(data.subscriptionStatus);
        if (typeof data.creditBalance === "number") setCreditBalance(data.creditBalance);
        if (data.hourlyRemaining !== undefined) {
          setRateLimitState({
            hourlyUsage: data.hourlyUsage ?? 0,
            hourlyRemaining: data.hourlyRemaining ?? 30,
            hourlyResetsAt: data.hourlyResetsAt ?? null,
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
          Billing updated
        </h1>
        <p className="text-sm mb-8" style={{ color: "#9494B8" }}>
          Your payment was processed. Your workspace is ready for the next request.
        </p>
        {creditBalance !== null && (
          <div
            className="mb-6 rounded-2xl px-4 py-3 text-sm"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", color: "#60A5FA" }}
          >
            Current credit balance: {creditBalance}
          </div>
        )}
        <Link
          href="/"
          className="inline-block px-8 py-3 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#818CF8", color: "#09090E" }}
        >
          Start Learning
        </Link>
      </motion.div>
    </div>
  );
}
