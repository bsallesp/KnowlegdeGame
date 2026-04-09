"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireUser } from "@/lib/useRequireUser";
import useAppStore from "@/store/useAppStore";

interface CreditBalanceResponse {
  balance: number;
}

interface BuilderRequestSummary {
  id: string;
  prompt: string;
  viabilityStatus: string | null;
  estimatedCredits: number;
  status: string;
  createdAt: string;
}

const QUICK_PROMPTS = [
  "Teach me databases with daily quizzes",
  "Plan an MVP for a competitor analysis agent",
  "Turn my weak points into a study session",
  "Map what I need to learn before Kubernetes",
];

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

export default function PrivateHomeDashboard() {
  const router = useRouter();
  const { loading } = useRequireUser();
  const userRole = useAppStore((s) => s.userRole);
  const userEmail = useAppStore((s) => s.userEmail);
  const plan = useAppStore((s) => s.plan);
  const [prompt, setPrompt] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [requests, setRequests] = useState<BuilderRequestSummary[]>([]);

  useEffect(() => {
    if (loading) return;

    fetch("/api/credits/balance")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data: CreditBalanceResponse | null) => {
        if (data) setCreditBalance(data.balance);
      })
      .catch(() => {});

    if (userRole === "master") {
      fetch("/api/builder/requests")
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data: { requests?: BuilderRequestSummary[] } | null) => {
          setRequests(data?.requests?.slice(0, 4) ?? []);
        })
        .catch(() => {});
    }
  }, [loading, userRole]);

  if (loading) return null;

  const encodedPrompt = encodeURIComponent(prompt.trim());
  const learnHref = prompt.trim() ? `/learn?topic=${encodedPrompt}` : "/learn";
  const builderHref = prompt.trim() ? `/builder?prompt=${encodedPrompt}` : "/builder";

  function submitHomePrompt(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(userRole === "master" ? builderHref : learnHref);
  }

  return (
    <main className="min-h-screen px-4 py-8" style={{ backgroundColor: "#09090E" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight" style={{ color: "#EEEEFF" }}>
            Dystoppia
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm transition-colors" style={{ color: "#9494B8" }}>
              Settings
            </Link>
            <Link href="/profile" className="text-sm transition-colors" style={{ color: "#9494B8" }}>
              Profile
            </Link>
            <Link href="/learn" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ backgroundColor: "#818CF8", color: "#09090E" }}>
              Learn
            </Link>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full max-w-3xl text-center"
          >
            <div
              className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full mb-6"
              style={{
                backgroundColor: "rgba(129,140,248,0.12)",
                border: "1px solid rgba(129,140,248,0.3)",
                color: "#818CF8",
              }}
            >
              {userEmail} · {plan} · {creditBalance ?? "..."} credits
            </div>

            <div className="mb-8">
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-3" style={{ color: "#EEEEFF" }}>
                What are we learning today?
              </h1>
              <p className="text-sm md:text-base" style={{ color: "#9494B8" }}>
                Ask for a lesson, a generated quiz, a product plan, or a research-backed roadmap.
              </p>
            </div>

            <form
              onSubmit={submitHomePrompt}
              className="rounded-2xl p-4 text-left"
              style={{
                backgroundColor: "#12121A",
                border: "1px solid #2E2E40",
                boxShadow: "0 4px 40px rgba(0,0,0,0.4)",
              }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                aria-label="Dystoppia prompt"
                rows={3}
                placeholder="Ask Dystoppia to teach, test, analyze, plan, compare, or build a roadmap..."
                className="min-h-28 w-full resize-none bg-transparent px-2 py-2 text-base leading-relaxed outline-none"
                style={{ color: "#EEEEFF" }}
              />

              <div className="flex flex-col gap-3 border-t px-2 pt-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "#2E2E40" }}>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Link href={learnHref} className="rounded-full px-3 py-1.5" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#38BDF8" }}>
                    Learn
                  </Link>
                  <Link href={builderHref} className="rounded-full px-3 py-1.5" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#818CF8" }}>
                    Build
                  </Link>
                  <Link href="/governance" className="rounded-full px-3 py-1.5" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#FACC15" }}>
                    Govern
                  </Link>
                </div>

                <button
                  type="submit"
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold"
                  style={{ backgroundColor: "#818CF8", color: "#09090E" }}
                >
                  Send
                </button>
              </div>
            </form>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {QUICK_PROMPTS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setPrompt(suggestion)}
                  className="rounded-xl px-4 py-3 text-left text-sm transition-all"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", color: "#9494B8" }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        </section>

        {userRole === "master" && requests.length > 0 && (
          <section className="pb-8">
            <div className="mx-auto max-w-5xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>Recent Builder requests</h2>
                <Link href="/builder" className="text-sm font-medium" style={{ color: "#818CF8" }}>
                  Open Builder
                </Link>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {requests.map((request) => (
                  <Link
                    href="/builder"
                    key={request.id}
                    className="rounded-2xl p-4 text-sm transition-transform hover:scale-[1.01]"
                    style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs" style={{ color: "#9494B8" }}>
                      <span>{request.viabilityStatus ?? request.status}</span>
                      <span>
                        {request.estimatedCredits} credits · {formatRelative(request.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 leading-relaxed" style={{ color: "#EEEEFF" }}>
                      {request.prompt}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
