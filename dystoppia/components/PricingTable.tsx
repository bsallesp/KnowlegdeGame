"use client";

import { motion } from "framer-motion";

interface Plan {
  id: string;
  name: string;
  price: number;
  hourlyLimit: number;
  audiobook: boolean;
  curriculumPerWeek: number;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    hourlyLimit: 5,
    curriculumPerWeek: 2,
    audiobook: false,
    features: ["5 questions/hour", "2 curricula/week"],
  },
  {
    id: "learner",
    name: "Learner",
    price: 7.99,
    hourlyLimit: 30,
    curriculumPerWeek: 10,
    audiobook: true,
    features: ["30 questions/hour", "10 curricula/week", "Audiobook generation"],
  },
  {
    id: "master",
    name: "Master",
    price: 16.99,
    hourlyLimit: 100,
    curriculumPerWeek: 9999,
    audiobook: true,
    features: ["100 questions/hour", "Unlimited curricula", "Audiobook generation"],
  },
];

interface PricingTableProps {
  onUpgrade?: (planId: string) => void;
  currentPlan?: string;
}

export default function PricingTable({ onUpgrade, currentPlan = "free" }: PricingTableProps) {
  const handleClick = async (planId: string) => {
    if (planId === "free") return;
    if (onUpgrade) {
      onUpgrade(planId);
      return;
    }

    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });

    if (res.ok) {
      const { url } = await res.json();
      window.location.assign(url);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mx-auto">
      {PLANS.map((plan, i) => {
        const isPopular = plan.id === "learner";
        const isCurrent = plan.id === currentPlan;

        return (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="relative flex flex-col rounded-2xl p-6"
            style={{
              backgroundColor: isPopular ? "rgba(129,140,248,0.07)" : "#12121A",
              border: `1px solid ${isPopular ? "#818CF8" : "#2E2E40"}`,
            }}
          >
            {isPopular && (
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full"
                style={{ backgroundColor: "#818CF8", color: "#09090E" }}
              >
                Most Popular
              </div>
            )}

            <div className="mb-4">
              <h3 className="font-bold text-lg" style={{ color: "#EEEEFF" }}>
                {plan.name}
              </h3>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-bold" style={{ color: "#EEEEFF" }}>
                  {plan.price === 0 ? "Free" : `$${plan.price}`}
                </span>
                {plan.price > 0 && (
                  <span className="text-sm" style={{ color: "#9494B8" }}>
                    /month
                  </span>
                )}
              </div>
            </div>

            <ul className="flex flex-col gap-2 mb-6 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm" style={{ color: "#9494B8" }}>
                  <span style={{ color: "#818CF8" }}>✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.id === "free" ? (
              <a
                href="/register"
                className="block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: "#1C1C28",
                  border: "1px solid #2E2E40",
                  color: "#9494B8",
                }}
              >
                {isCurrent ? "Current plan" : "Get started free"}
              </a>
            ) : (
              <motion.button
                onClick={() => handleClick(plan.id)}
                whileHover={{ scale: isCurrent ? 1 : 1.02 }}
                whileTap={{ scale: isCurrent ? 1 : 0.98 }}
                disabled={isCurrent}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: isCurrent ? "#1C1C28" : "#818CF8",
                  color: isCurrent ? "#9494B8" : "#09090E",
                  border: isCurrent ? "1px solid #2E2E40" : "none",
                  cursor: isCurrent ? "default" : "pointer",
                }}
              >
                {isCurrent ? "Current plan" : "Subscribe"}
              </motion.button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
