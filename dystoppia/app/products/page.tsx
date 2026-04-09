"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRequireUser } from "@/lib/useRequireUser";

const PRODUCTS = [
  {
    id: "learn",
    name: "Dystoppia Learn",
    description:
      "Adaptive knowledge learning powered by AI. Enter any topic, get a structured curriculum, and master it through spaced repetition and intelligent quizzes.",
    status: "live" as const,
    href: "/learn",
    color: "#38BDF8",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
];

const COMING_SOON = [
  {
    id: "deploy",
    name: "Dystoppia Deploy",
    description: "Automated cloud provisioning and deployment pipelines on Azure.",
    color: "#818CF8",
  },
  {
    id: "monitor",
    name: "Dystoppia Monitor",
    description: "Real-time observability, cost tracking, and incident management.",
    color: "#A78BFA",
  },
  {
    id: "research",
    name: "Dystoppia Research",
    description: "Competitive intelligence, market analysis, and business model breakdown.",
    color: "#60A5FA",
  },
];

export default function ProductsPage() {
  const { loading } = useRequireUser();
  if (loading) return null;

  return (
    <main className="min-h-screen px-4 py-8" style={{ backgroundColor: "#09090E" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight"
            style={{ color: "#EEEEFF" }}
          >
            Dystoppia
          </Link>
          <Link
            href="/"
            className="text-sm transition-colors"
            style={{ color: "#9494B8" }}
          >
            Back to home
          </Link>
        </header>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight mb-3"
            style={{ color: "#EEEEFF" }}
          >
            Products
          </h1>
          <p className="text-base" style={{ color: "#9494B8" }}>
            Tools built on the Dystoppia platform.
          </p>
        </motion.div>

        {/* Live products */}
        <section className="mb-16">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ color: "#818CF8" }}
          >
            Available now
          </h2>

          <div className="grid gap-4">
            {PRODUCTS.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Link
                  href={product.href}
                  className="block rounded-2xl p-6 transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: "#12121A",
                    border: "1px solid #2E2E40",
                  }}
                >
                  <div className="flex items-start gap-5">
                    <div
                      className="flex-shrink-0 p-3 rounded-xl"
                      style={{
                        backgroundColor: `${product.color}15`,
                        color: product.color,
                      }}
                    >
                      {product.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3
                          className="text-lg font-bold"
                          style={{ color: "#EEEEFF" }}
                        >
                          {product.name}
                        </h3>
                        <span
                          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: "rgba(96, 165, 250, 0.15)",
                            color: "#60A5FA",
                          }}
                        >
                          Live
                        </span>
                      </div>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "#9494B8" }}
                      >
                        {product.description}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 flex-shrink-0 mt-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      style={{ color: "#2E2E40" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Coming soon */}
        <section>
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ color: "#9494B8" }}
          >
            Coming soon
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {COMING_SOON.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: "#12121A",
                  border: "1px solid #1C1C28",
                  opacity: 0.6,
                }}
              >
                <div
                  className="w-3 h-3 rounded-full mb-4"
                  style={{ backgroundColor: product.color, opacity: 0.5 }}
                />
                <h3
                  className="text-sm font-bold mb-2"
                  style={{ color: "#EEEEFF" }}
                >
                  {product.name}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>
                  {product.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
