"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import PricingTable from "./PricingTable";
import WaitlistForm from "./WaitlistForm";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Type any topic",
    description:
      "Enter any subject — from AWS certifications to Roman history. Dystoppia builds a structured curriculum in seconds.",
    icon: "🔍",
  },
  {
    step: "02",
    title: "AI designs your curriculum",
    description:
      "Claude analyzes the domain and generates a teaching profile. Questions adapt to the pedagogy of your subject.",
    icon: "🧠",
  },
  {
    step: "03",
    title: "Questions adapt to you",
    description:
      "Spaced repetition and difficulty scaling keep you in the learning zone. Hard when you're ready, gentle when you're stuck.",
    icon: "⚡",
  },
];

export default function LandingPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#09090E", color: "#EEEEFF" }}
    >
      {/* Nav */}
      <nav
        className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full"
      >
        <span className="font-bold text-lg tracking-tight" style={{ color: "#EEEEFF" }}>
          Dystoppia
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm transition-colors"
            style={{ color: "#9494B8" }}
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold px-4 py-2 rounded-xl transition-all"
            style={{ backgroundColor: "#818CF8", color: "#09090E" }}
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 max-w-3xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-6"
            style={{
              backgroundColor: "rgba(129,140,248,0.12)",
              border: "1px solid rgba(129,140,248,0.3)",
              color: "#818CF8",
            }}
          >
            AI-powered adaptive learning
          </div>

          <h1
            className="text-4xl md:text-6xl font-bold leading-tight mb-6"
            style={{ color: "#EEEEFF" }}
          >
            Learn anything.{" "}
            <span style={{ color: "#818CF8" }}>Adapt to you.</span>
          </h1>

          <p className="text-lg mb-10 max-w-xl mx-auto" style={{ color: "#9494B8" }}>
            AI-powered quiz engine that adjusts to your pace, your weak spots, and your
            learning style — in real time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="px-8 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ backgroundColor: "#818CF8", color: "#09090E" }}
            >
              Start for free
            </Link>
            <a
              href="#how-it-works"
              className="px-8 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{
                backgroundColor: "transparent",
                border: "1px solid #2E2E40",
                color: "#9494B8",
              }}
            >
              See how it works
            </a>
          </div>
        </motion.div>

        {/* Product preview card */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-16 w-full max-w-lg rounded-2xl p-6 text-left"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
        >
          <div
            className="text-xs font-semibold mb-3 px-2 py-1 rounded-md inline-block"
            style={{ backgroundColor: "rgba(129,140,248,0.1)", color: "#818CF8" }}
          >
            Question 3 of 5 · AWS Solutions Architect
          </div>
          <p className="text-sm font-medium mb-4" style={{ color: "#EEEEFF" }}>
            Which AWS service should you use to decouple a high-throughput order processing
            system so that downstream services are not overwhelmed?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {["Amazon SNS", "Amazon SQS", "AWS Lambda", "Amazon EventBridge"].map((opt, i) => (
              <div
                key={opt}
                className="text-xs px-3 py-2.5 rounded-xl"
                style={{
                  backgroundColor: i === 1 ? "rgba(129,140,248,0.15)" : "#1C1C28",
                  border: `1px solid ${i === 1 ? "#818CF8" : "#2E2E40"}`,
                  color: i === 1 ? "#818CF8" : "#9494B8",
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="py-24 px-6"
        style={{ backgroundColor: "#0D0D15" }}
      >
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-center mb-16"
            style={{ color: "#EEEEFF" }}
          >
            How it works
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="flex flex-col"
              >
                <div className="text-3xl mb-4">{step.icon}</div>
                <div
                  className="text-xs font-mono font-semibold mb-2"
                  style={{ color: "#818CF8" }}
                >
                  {step.step}
                </div>
                <h3 className="font-bold text-lg mb-2" style={{ color: "#EEEEFF" }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold mb-3" style={{ color: "#EEEEFF" }}>
              Simple pricing
            </h2>
            <p className="text-sm" style={{ color: "#9494B8" }}>
              Cancel anytime. No hidden fees.
            </p>
          </motion.div>

          <PricingTable />
        </div>
      </section>

      {/* Waitlist */}
      <section
        id="waitlist"
        className="py-24 px-6"
        style={{ backgroundColor: "#0D0D15" }}
      >
        <div className="max-w-xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-bold mb-3" style={{ color: "#EEEEFF" }}>
              Stay in the loop
            </h2>
            <p className="text-sm mb-8" style={{ color: "#9494B8" }}>
              Get notified when new features drop. No spam.
            </p>
            <div className="flex justify-center">
              <WaitlistForm source="landing_waitlist" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 px-6 text-center text-xs"
        style={{ color: "#6B6B8A", borderTop: "1px solid #2E2E40" }}
      >
        <div className="flex items-center justify-center gap-6 mb-3">
          <Link href="/login" className="hover:opacity-80 transition-opacity">
            Log in
          </Link>
          <Link href="/register" className="hover:opacity-80 transition-opacity">
            Sign up
          </Link>
          <Link href="/privacy" className="hover:opacity-80 transition-opacity">
            Privacy
          </Link>
        </div>
        <p>© {new Date().getFullYear()} Dystoppia. All rights reserved.</p>
      </footer>
    </div>
  );
}
