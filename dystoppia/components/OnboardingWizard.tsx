"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OnboardingMessage, OnboardingTurn, OnboardingSummary, OnboardingChatResponse } from "@/types";

interface OnboardingWizardProps {
  topic: string;
  pillar: "studio";
  topicExists: boolean;
  onComplete: (onboardingContext: string) => void;
  onSkip: () => void;
}

export default function OnboardingWizard({
  topic,
  pillar,
  topicExists,
  onComplete,
  onSkip,
}: OnboardingWizardProps) {
  const [messages, setMessages] = useState<OnboardingMessage[]>([]);
  const [currentTurn, setCurrentTurn] = useState<OnboardingTurn | null>(null);
  const [summary, setSummary] = useState<OnboardingSummary>({ topic });
  const [isLoading, setIsLoading] = useState(true);
  const [readyToCreate, setReadyToCreate] = useState(false);
  const [onboardingContext, setOnboardingContext] = useState("");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [turnIndex, setTurnIndex] = useState(0);
  const [error, setError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchNextTurn([]);
  }, []);

  const fetchNextTurn = async (msgs: OnboardingMessage[]) => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, messages: msgs, pillar }),
      });
      if (!res.ok) throw new Error("API error");
      const data: OnboardingChatResponse = await res.json();
      setCurrentTurn(data.turn);
      setSummary(data.summary);
      if (data.readyToCreate) {
        setReadyToCreate(true);
        setOnboardingContext(data.onboardingContext ?? "");
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!selectedCards.length && !freeText.trim()) return;

    const content =
      freeText.trim() ||
      selectedCards
        .map((id) => currentTurn?.cards.find((c) => c.id === id)?.label ?? id)
        .join(", ");

    const newMessages: OnboardingMessage[] = [
      ...messages,
      { role: "assistant", content: currentTurn?.question ?? "" },
      { role: "user", content, selectedCards: selectedCards.length ? selectedCards : undefined },
    ];

    setMessages(newMessages);
    setSelectedCards([]);
    setFreeText("");
    setTurnIndex((t) => t + 1);
    fetchNextTurn(newMessages);
  };

  const handleSkipClick = () => {
    if (turnIndex === 0) {
      setShowSkipWarning(true);
    } else {
      onSkip();
    }
  };

  const toggleCard = (id: string) => {
    if (currentTurn?.multiSelect) {
      setSelectedCards((prev) =>
        prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
      );
    } else {
      setSelectedCards([id]);
    }
  };

  const summaryEntries = Object.entries(summary).filter(
    ([k, v]) => k !== "topic" && v && typeof v === "string"
  );
  const canSubmit = selectedCards.length > 0 || freeText.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "#09090E" }}
    >
      {/* Ambient gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #1E1E2E" }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: "#818CF8" }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-sm" style={{ color: "#9494B8" }}>
            Personalizing your journey
          </span>
        </div>
        <div
          className="px-3 py-1 rounded-lg text-xs font-semibold"
          style={{
            backgroundColor: "rgba(129, 140, 248, 0.1)",
            border: "1px solid rgba(129, 140, 248, 0.2)",
            color: "#818CF8",
          }}
        >
          {topic}
        </div>
        <button
          onClick={handleSkipClick}
          className="text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{ color: "#4B4B6B", border: "1px solid #2E2E40" }}
        >
          Skip →
        </button>
      </div>

      {/* Main content area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 overflow-auto">
        <div className="w-full max-w-lg flex flex-col gap-8">

          {/* Topic-exists notice */}
          {topicExists && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center px-4 py-2 rounded-xl text-xs"
              style={{
                backgroundColor: "rgba(129, 140, 248, 0.06)",
                border: "1px solid rgba(129, 140, 248, 0.15)",
                color: "#9494B8",
              }}
            >
              You have studied this topic before. Let's personalize your new session.
            </motion.div>
          )}

          {/* Question / loading / ready area */}
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <p className="text-sm" style={{ color: "#F97316" }}>
                  Could not load onboarding.
                </p>
                <button
                  onClick={onSkip}
                  className="text-xs px-4 py-2 rounded-lg"
                  style={{ backgroundColor: "#1C1C28", color: "#9494B8", border: "1px solid #2E2E40" }}
                >
                  Continue without personalization
                </button>
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: "#818CF8" }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
                <p className="text-sm" style={{ color: "#4B4B6B" }}>
                  Analyzing the topic...
                </p>
              </motion.div>
            ) : readyToCreate ? (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
                  style={{
                    backgroundColor: "rgba(129, 140, 248, 0.12)",
                    border: "1px solid rgba(129, 140, 248, 0.3)",
                  }}
                >
                  ✓
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold mb-2" style={{ color: "#EEEEFF" }}>
                    Profile ready!
                  </h2>
                  <p className="text-sm" style={{ color: "#9494B8" }}>
                    We created a personalized learning plan for your goals.
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onComplete(onboardingContext)}
                  className="px-8 py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white", border: "none" }}
                >
                  Create personalized content →
                </motion.button>
              </motion.div>
            ) : currentTurn ? (
              <motion.div
                key={`turn-${turnIndex}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-6"
              >
                {/* Question text */}
                <div className="text-center">
                  <h2
                    className="text-xl font-bold mb-2 leading-tight"
                    style={{ color: "#EEEEFF" }}
                  >
                    {currentTurn.question}
                  </h2>
                  {currentTurn.subtitle && (
                    <p className="text-sm" style={{ color: "#9494B8" }}>
                      {currentTurn.subtitle}
                    </p>
                  )}
                </div>

                {/* Cards grid */}
                {currentTurn.cards.length > 0 && (
                  <div
                    className={`grid gap-3 ${
                      currentTurn.cards.length <= 2
                        ? "grid-cols-2"
                        : currentTurn.cards.length === 3
                        ? "grid-cols-3"
                        : "grid-cols-2"
                    }`}
                  >
                    {currentTurn.cards.map((card) => {
                      const isSelected = selectedCards.includes(card.id);
                      return (
                        <motion.button
                          key={card.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleCard(card.id)}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all"
                          style={{
                            backgroundColor: isSelected
                              ? "rgba(129, 140, 248, 0.15)"
                              : "#12121A",
                            border: isSelected
                              ? "1px solid rgba(129, 140, 248, 0.5)"
                              : "1px solid #2E2E40",
                          }}
                        >
                          {card.icon && (
                            <span className="text-2xl">{card.icon}</span>
                          )}
                          <span
                            className="text-sm font-semibold leading-tight"
                            style={{ color: isSelected ? "#818CF8" : "#EEEEFF" }}
                          >
                            {card.label}
                          </span>
                          {card.description && (
                            <span
                              className="text-xs leading-tight"
                              style={{ color: "#4B4B6B" }}
                            >
                              {card.description}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* Free text input */}
                {currentTurn.allowFreeText && (
                  <div>
                    {currentTurn.cards.length > 0 && (
                      <p
                        className="text-xs text-center mb-2"
                        style={{ color: "#4B4B6B" }}
                      >
                        or describe in your own words
                      </p>
                    )}
                    <textarea
                      ref={textareaRef}
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      placeholder={
                        currentTurn.freeTextPlaceholder ?? "Type here..."
                      }
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl text-sm resize-none outline-none transition-all"
                      style={{
                        backgroundColor: "#12121A",
                        border: freeText
                          ? "1px solid rgba(129, 140, 248, 0.4)"
                          : "1px solid #2E2E40",
                        color: "#EEEEFF",
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          canSubmit
                        ) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                    />
                  </div>
                )}

                {/* Continue button */}
                <div className="flex justify-end">
                  <motion.button
                    whileHover={canSubmit ? { scale: 1.02 } : {}}
                    whileTap={canSubmit ? { scale: 0.98 } : {}}
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-all"
                    style={{
                      backgroundColor: canSubmit ? "#818CF8" : "#1C1C28",
                      color: canSubmit ? "white" : "#4B4B6B",
                      border: "none",
                      cursor: canSubmit ? "pointer" : "default",
                    }}
                  >
                    Continue →
                  </motion.button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Summary bar — grows as conversation progresses */}
      <AnimatePresence>
        {summaryEntries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 px-6 py-4"
            style={{ borderTop: "1px solid #1E1E2E" }}
          >
            <p className="text-xs mb-2" style={{ color: "#4B4B6B" }}>
              Your learning profile
            </p>
            <div className="flex flex-wrap gap-2">
              <div
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "rgba(129, 140, 248, 0.1)",
                  color: "#818CF8",
                  border: "1px solid rgba(129, 140, 248, 0.2)",
                }}
              >
                {topic}
              </div>
              {summaryEntries.map(([key, value]) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: "#12121A",
                    color: "#9494B8",
                    border: "1px solid #2E2E40",
                  }}
                >
                  {value}
                </motion.div>
              ))}
            </div>

            {/* Early-create button when profile has enough data but AI hasn't declared ready yet */}
            {!readyToCreate && turnIndex >= 2 && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onComplete(onboardingContext || `Topic: ${topic}. ${summaryEntries.map(([k, v]) => `${k}: ${v}`).join(". ")}`)}
                className="mt-3 w-full py-2.5 rounded-xl font-semibold text-sm text-center transition-all"
                style={{
                  backgroundColor: "rgba(129, 140, 248, 0.08)",
                  color: "#818CF8",
                  border: "1px solid rgba(129, 140, 248, 0.2)",
                }}
              >
                This is enough, create content →
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip warning modal */}
      <AnimatePresence>
        {showSkipWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 flex items-center justify-center px-4"
            style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm p-6 rounded-2xl flex flex-col gap-4"
              style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
            >
              <div className="text-center">
                <p className="text-2xl mb-3">⚠️</p>
                <h3
                  className="text-base font-bold mb-2"
                  style={{ color: "#EEEEFF" }}
                >
                  Skip personalization?
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>
                  Without onboarding, the content will be generic and less accurate
                  for your goals and level.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSkipWarning(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: "#1C1C28",
                    color: "#9494B8",
                    border: "1px solid #2E2E40",
                  }}
                >
                  Continue
                </button>
                <button
                  onClick={() => {
                    setShowSkipWarning(false);
                    onSkip();
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    backgroundColor: "rgba(249, 115, 22, 0.1)",
                    color: "#F97316",
                    border: "1px solid rgba(249, 115, 22, 0.3)",
                  }}
                >
                  Skip anyway
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

