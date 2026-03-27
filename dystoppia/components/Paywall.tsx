"use client";

import { useState } from "react";
import { motion } from "framer-motion";
interface PaywallProps {
  onClose: () => void;
}

const UPGRADE_PLANS = [
  { id: "learner", name: "Learner", price: "$4.99/mo", questions: "500 questions/month" },
  { id: "master", name: "Master", price: "$9.99/mo", questions: "2000 questions/month" },
];

export default function Paywall({ onClose }: PaywallProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpgrade = async (planId: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      if (!res.ok) throw new Error("Upgrade failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError("Upgrade failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(9,9,14,0.92)", backdropFilter: "blur(8px)" }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22 }}
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
      >
        <div className="text-3xl mb-3 text-center">⚡</div>
        <h2 className="text-xl font-bold mb-1 text-center" style={{ color: "#EEEEFF" }}>
          Out of credits
        </h2>
        <p className="text-sm mb-6 text-center" style={{ color: "#9494B8" }}>
          Upgrade to keep learning.
        </p>

        <div className="flex flex-col gap-3 mb-4">
          {UPGRADE_PLANS.map((plan) => (
            <motion.button
              key={plan.id}
              onClick={() => handleUpgrade(plan.id)}
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              className="w-full py-3 px-4 rounded-xl text-left transition-all"
              style={{
                backgroundColor: "#1C1C28",
                border: "1px solid #818CF8",
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <div className="font-semibold text-sm" style={{ color: "#EEEEFF" }}>
                {plan.name} — {plan.price}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "#9494B8" }}>
                {plan.questions}
              </div>
            </motion.button>
          ))}
        </div>

        {error && (
          <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}>
            {error}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full text-xs py-2 transition-colors"
          style={{ color: "#9494B8" }}
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}
