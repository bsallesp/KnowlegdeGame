"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import NeuralTransition from "@/components/NeuralTransition";
import OnboardingWizard from "@/components/OnboardingWizard";
import useAppStore from "@/store/useAppStore";
import { useRequireUser } from "@/lib/useRequireUser";
import type { Item, Topic } from "@/types";
import TopicApprovalScreen from "@/components/TopicApprovalScreen";

type Mode = "studio" | "lens" | "reach";

interface TopicHistory {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  totalAnswers: number;
  correctRate: number | null;
}

const MODES: { id: Mode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: "studio",
    label: "Studio",
    description: "Create learning content",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: "lens",
    label: "Lens",
    description: "Extract from the web",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    id: "reach",
    label: "Reach",
    description: "Manage your ads",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    ),
  },
];

export default function SearchPage() {
  const { loading: authLoading } = useRequireUser();
  const [mode, setMode] = useState<Mode>("studio");
  const [query, setQuery] = useState("");
  const [lensUrl, setLensUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTransition, setShowTransition] = useState(false);
  const [history, setHistory] = useState<TopicHistory[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingTopic, setPendingTopic] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [resumingSlug, setResumingSlug] = useState<string | null>(null);
  const [approvalTopic, setApprovalTopic] = useState<Topic | null>(null);
  const { setCurrentTopic, addItemToCurrentTopic, resetSession, toggleItemMute } = useAppStore();

  useEffect(() => {
    if (authLoading) return;
    fetch("/api/topics")
      .then((r) => r.json())
      .then((data) => setHistory(data.topics || []))
      .catch(() => {});
  }, [authLoading]);

  if (authLoading) return null;

  const handleSearch = (e?: React.FormEvent, topicOverride?: string) => {
    if (e) e.preventDefault();
    const topic = topicOverride ?? query.trim();
    if (!topic || isLoading) return;
    setError("");
    setPendingTopic(topic);
    setShowOnboarding(true);
  };

  const proceedWithContent = async (topic: string, onboardingContext?: string, isNewTopic = false) => {
    setShowOnboarding(false);
    setIsLoading(true);
    setShowTransition(true);
    resetSession();

    const pendingId = `pending_${Date.now()}`;
    setCurrentTopic({
      id: pendingId,
      name: topic,
      slug: topic.toLowerCase().replace(/\s+/g, "-"),
      createdAt: new Date().toISOString(),
      teachingProfile: null,
      items: [],
    });

    try {
      const res = await fetch("/api/generate-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, onboardingContext }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to generate topic structure");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let itemIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              data?: unknown;
              message?: string;
            };

            if (event.type === "item") {
              const rawItem = event.data as { name: string; subItems: Array<{ name: string }> };
              const tempItemId = `temp_item_${itemIndex}`;
              const item: Item = {
                id: tempItemId,
                topicId: pendingId,
                name: rawItem.name,
                order: itemIndex,
                muted: false,
                subItems: (rawItem.subItems || []).map((sub, si) => ({
                  id: `temp_sub_${itemIndex}_${si}`,
                  itemId: tempItemId,
                  name: sub.name,
                  order: si,
                  muted: false,
                  difficulty: 1,
                })),
              };
              addItemToCurrentTopic(item);
              itemIndex++;
            } else if (event.type === "done") {
              const fullTopic = event.data as Parameters<typeof setCurrentTopic>[0];
              setCurrentTopic(fullTopic);
              prefetchFirstSubItems(fullTopic);
              setIsLoading(false);
              setShowTransition(false);
              if (isNewTopic) {
                setApprovalTopic(fullTopic as Topic);
              } else {
                router.push("/session");
              }
            } else if (event.type === "error") {
              throw new Error(event.message || "Stream error");
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Stream error") {
              // Skip malformed SSE lines
            } else {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setShowTransition(false);
      setIsLoading(false);
    }
  };

  function prefetchFirstSubItems(topic: Parameters<typeof setCurrentTopic>[0]) {
    const PREFETCH_ITEM_COUNT = 2;
    for (const item of topic.items.slice(0, PREFETCH_ITEM_COUNT)) {
      const firstActive = item.subItems.find((sub) => !sub.muted);
      if (!firstActive) continue;
      fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subItemId: firstActive.id,
          count: 3,
          difficulty: firstActive.difficulty,
        }),
      }).catch(() => {/* fire-and-forget */});
    }
  }

  const resumeTopic = async (slug: string) => {
    if (resumingSlug) return;
    setResumingSlug(slug);
    try {
      const res = await fetch(`/api/topics?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Failed to load topic");
      const topic = await res.json();
      resetSession();
      setCurrentTopic(topic);
      router.push("/session");
    } catch {
      setError("Could not load the topic. Try again.");
      setResumingSlug(null);
    }
  };

  const topicExists = (t: string) =>
    history.some((h) => h.slug === t.toLowerCase().replace(/\s+/g, "-"));

  const handleApprovalConfirm = (disabledItemIds: Set<string>) => {
    for (const id of disabledItemIds) {
      toggleItemMute(id);
      fetch("/api/toggle-mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: "item" }),
      }).catch(() => {});
    }
    setApprovalTopic(null);
    router.push("/session");
  };

  return (
    <>
      <NeuralTransition visible={showTransition} topic={pendingTopic || query.trim()} />

      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWizard
            topic={pendingTopic}
            pillar={mode as "studio" | "lens" | "reach"}
            topicExists={topicExists(pendingTopic)}
            onComplete={(ctx) => proceedWithContent(pendingTopic, ctx, !topicExists(pendingTopic))}
            onSkip={() => proceedWithContent(pendingTopic)}
          />
        )}
        {approvalTopic && (
          <TopicApprovalScreen
            topic={approvalTopic}
            onConfirm={handleApprovalConfirm}
          />
        )}
      </AnimatePresence>

      <main
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: "#09090E" }}
      >
        {/* Background gradient */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 w-full max-w-xl flex flex-col items-center gap-8">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center"
          >
            <h1
              className="text-5xl font-bold tracking-tight mb-2"
              style={{ color: "#EEEEFF" }}
            >
              Dystoppia
            </h1>
            <p className="text-sm" style={{ color: "#9494B8" }}>
              Adaptive knowledge learning — powered by AI
            </p>
          </motion.div>

          {/* Mode selector */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="w-full grid grid-cols-3 gap-3"
          >
            {MODES.map((m) => {
              const isActive = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? "rgba(129, 140, 248, 0.12)" : "#12121A",
                    border: isActive ? "1px solid rgba(129, 140, 248, 0.4)" : "1px solid #2E2E40",
                    color: isActive ? "#818CF8" : "#9494B8",
                  }}
                >
                  <div style={{ color: isActive ? "#818CF8" : "#4B4B6B" }}>{m.icon}</div>
                  <span className="text-sm font-semibold">{m.label}</span>
                  <span className="text-xs leading-tight text-center" style={{ color: isActive ? "#9494B8" : "#4B4B6B" }}>
                    {m.description}
                  </span>
                </button>
              );
            })}
          </motion.div>

          {/* Content area */}
          <AnimatePresence mode="wait">
            {mode === "studio" && (
              <motion.div
                key="studio"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="w-full flex flex-col gap-6"
              >
                {/* Search form */}
                <form onSubmit={handleSearch}>
                  <div
                    className="relative flex items-center rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: "#12121A",
                      border: "1px solid #2E2E40",
                      boxShadow: "0 4px 40px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div className="pl-4 pr-3 flex items-center" style={{ color: "#9494B8" }}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="What do you want to learn today?"
                      className="flex-1 py-4 pr-4 text-base bg-transparent outline-none"
                      style={{ color: "#EEEEFF" }}
                      disabled={isLoading}
                      autoFocus
                    />
                    <AnimatePresence>
                      {query.trim() && (
                        <motion.button
                          type="submit"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={isLoading}
                          className="mr-2 px-5 py-2 rounded-xl font-semibold text-sm transition-all"
                          style={{ backgroundColor: "#818CF8", color: "white", flexShrink: 0, border: "none" }}
                        >
                          Learn
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </form>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-sm px-4 py-2 rounded-lg"
                      style={{
                        backgroundColor: "rgba(249, 115, 22, 0.1)",
                        border: "1px solid rgba(249, 115, 22, 0.3)",
                        color: "#F97316",
                      }}
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* History or suggestions */}
                <AnimatePresence mode="wait">
                  {history.length > 0 ? (
                    <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                      <p className="text-xs mb-3 text-center" style={{ color: "#9494B8" }}>
                        Continue learning
                      </p>
                      <div className="flex flex-col gap-2">
                        {history.map((topic, i) => (
                          <motion.button
                            key={topic.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => resumeTopic(topic.slug)}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            disabled={!!resumingSlug}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all"
                            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", opacity: resumingSlug === topic.slug ? 0.6 : 1 }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#818CF8" }} />
                              <span className="text-sm font-medium" style={{ color: "#EEEEFF" }}>{topic.name}</span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {topic.totalAnswers > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 rounded-full overflow-hidden" style={{ width: "60px", backgroundColor: "#2E2E40" }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${topic.correctRate ?? 0}%`, backgroundColor: "#60A5FA" }} />
                                  </div>
                                  <span className="text-xs" style={{ color: "#9494B8" }}>{topic.correctRate}%</span>
                                </div>
                              )}
                              <span className="text-xs" style={{ color: "#2E2E40" }}>
                                {topic.totalAnswers > 0 ? `${topic.totalAnswers} answers` : "Not started"}
                              </span>
                              <svg className="w-4 h-4" style={{ color: "#2E2E40" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="suggestions"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-wrap gap-2 justify-center"
                    >
                      {["Quantum Computing", "Roman History", "Machine Learning", "Jazz Theory", "DNA Replication"].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => { setQuery(suggestion); inputRef.current?.focus(); }}
                          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                          style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {mode === "lens" && (
              <motion.div
                key="lens"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="w-full flex flex-col gap-4"
              >
                <div
                  className="relative flex items-center rounded-2xl overflow-hidden"
                  style={{
                    backgroundColor: "#12121A",
                    border: "1px solid #2E2E40",
                    boxShadow: "0 4px 40px rgba(0,0,0,0.4)",
                  }}
                >
                  <div className="pl-4 pr-3 flex items-center" style={{ color: "#9494B8" }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <input
                    type="url"
                    value={lensUrl}
                    onChange={(e) => setLensUrl(e.target.value)}
                    placeholder="Paste a URL to extract knowledge from..."
                    className="flex-1 py-4 pr-4 text-base bg-transparent outline-none"
                    style={{ color: "#EEEEFF" }}
                    autoFocus
                  />
                  <AnimatePresence>
                    {lensUrl.trim() && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="mr-2 px-5 py-2 rounded-xl font-semibold text-sm"
                        style={{ backgroundColor: "#818CF8", color: "white", flexShrink: 0, border: "none" }}
                      >
                        Extract
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                <div
                  className="flex flex-col items-center gap-3 py-8 rounded-2xl"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(129, 140, 248, 0.1)", border: "1px solid rgba(129, 140, 248, 0.2)" }}
                  >
                    <svg className="w-5 h-5" style={{ color: "#818CF8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: "#EEEEFF" }}>Lens is coming soon</p>
                  <p className="text-xs text-center max-w-xs" style={{ color: "#4B4B6B" }}>
                    Paste any URL and we&apos;ll extract, summarize, and turn it into structured learning content.
                  </p>
                </div>
              </motion.div>
            )}

            {mode === "reach" && (
              <motion.div
                key="reach"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="w-full"
              >
                <div
                  className="flex flex-col items-center gap-3 py-8 rounded-2xl"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(129, 140, 248, 0.1)", border: "1px solid rgba(129, 140, 248, 0.2)" }}
                  >
                    <svg className="w-5 h-5" style={{ color: "#818CF8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium" style={{ color: "#EEEEFF" }}>Reach is coming soon</p>
                  <p className="text-xs text-center max-w-xs" style={{ color: "#4B4B6B" }}>
                    Automate and manage your Google Ads, Meta Ads, and more — all from one intelligent dashboard.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex gap-4 text-xs"
            style={{ color: "#9494B8" }}
          >
            <a
              href="/profile"
              className="hover:text-primary transition-colors flex items-center gap-1"
              style={{ color: "#9494B8" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </a>
            <a
              href="/settings"
              className="hover:text-primary transition-colors flex items-center gap-1"
              style={{ color: "#9494B8" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </a>
          </motion.div>
        </div>
      </main>
    </>
  );
}
