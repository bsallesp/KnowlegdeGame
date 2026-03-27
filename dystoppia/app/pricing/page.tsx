"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import PricingTable from "@/components/PricingTable";
import useAppStore from "@/store/useAppStore";
import { useRequireUser } from "@/lib/useRequireUser";

export default function PricingPage() {
  useRequireUser();
  const plan = useAppStore((s) => s.plan);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#09090E", color: "#EEEEFF" }}
    >
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <Link href="/" className="font-bold text-lg tracking-tight" style={{ color: "#EEEEFF" }}>
          Dystoppia
        </Link>
        <Link href="/" className="text-sm" style={{ color: "#9494B8" }}>
          Back to app
        </Link>
      </nav>

      <div className="flex-1 py-24 px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16 max-w-xl mx-auto"
        >
          <h1 className="text-4xl font-bold mb-4" style={{ color: "#EEEEFF" }}>
            Upgrade your plan
          </h1>
          <p className="text-sm" style={{ color: "#9494B8" }}>
            Cancel anytime. No hidden fees.
          </p>
        </motion.div>

        <PricingTable currentPlan={plan} />
      </div>
    </div>
  );
}
