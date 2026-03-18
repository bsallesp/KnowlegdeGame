"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";
import TopicDashboard from "@/components/TopicDashboard";
import ConveyorBelt from "@/components/ConveyorBelt";
import QuestionCard from "@/components/QuestionCard";
import SkeletonBlock from "@/components/ui/SkeletonBlock";
import { selectNextSubItem } from "@/lib/adaptive";
import { logger } from "@/lib/logger";
import type { Question } from "@/types";

interface XPPopup {
  id: number;
  amount: number;
}

export default function SessionPage() {
  const router = useRouter();
  const {
    currentTopic,
    questionQueue,
    currentQuestion,
    subItemStats,
    settings,
    isGenerating,
    answerShown,
    lastAnswerCorrect,
    sessionId,
    xp,
    sessionXP,
    streak,
    lives,
    maxLives,
    setCurrentQuestion,
    addToQueue,
    advanceQueue,
    updateSubItemStats,
    hydrateSubItemStats,
    setIsGenerating,
    setAnswerShown,
    setLastAnswerCorrect,
    toggleItemMute,
    toggleSubItemMute,
    addXP,
    checkAndUpdateStreak,
    loseLife,
    resetLives,
  } = useAppStore();

  const [userAnswer, setUserAnswer] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [xpPopups, setXpPopups] = useState<XPPopup[]>([]);
  const [showGameOver, setShowGameOver] = useState(false);
  const generatingRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Redirect if no topic
  useEffect(() => {
    if (!currentTopic) {
      router.push("/");
    }
  }, [currentTopic, router]);

  const getAllSubItems = useCallback(() => {
    if (!currentTopic) return [];
    return currentTopic.items.flatMap((item) =>
      item.muted ? [] : item.subItems
    );
  }, [currentTopic]);

  const generateQuestionsForSubItem = useCallback(
    async (subItemId: string, count: number) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsGenerating(true);
      logger.info("session", `Generating questions for subItem ${subItemId}`, { count });

      try {
        const subItems = getAllSubItems();
        const subItem = subItems.find((s) => s.id === subItemId);
        if (!subItem) return;

        const stats = subItemStats[subItemId];

        const res = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subItemId,
            difficulty: subItem.difficulty,
            count,
            stats,
          }),
        });

        if (!res.ok) throw new Error("Failed to generate questions");

        const data = await res.json();
        const questionsWithSubItem: Question[] = data.questions.map((q: Question) => ({
          ...q,
          subItem,
        }));

        logger.debug("session", `Added ${questionsWithSubItem.length} questions to queue`);
        addToQueue(questionsWithSubItem);
      } catch (err) {
        logger.error("session", "Failed to generate questions", err);
      } finally {
        isFetchingRef.current = false;
        setIsGenerating(false);
      }
    },
    [getAllSubItems, subItemStats, addToQueue, setIsGenerating]
  );

  const fillQueue = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;

    try {
      const subItems = getAllSubItems();
      const activeSubItems = subItems.filter((s) => !s.muted);
      if (activeSubItems.length === 0) return;

      const needed = settings.queueDepth - questionQueue.length;
      if (needed <= 0) return;

      const subItemId = selectNextSubItem(activeSubItems, subItemStats);
      if (!subItemId) return;

      await generateQuestionsForSubItem(subItemId, Math.min(needed, 3));
    } finally {
      generatingRef.current = false;
    }
  }, [getAllSubItems, questionQueue.length, settings.queueDepth, subItemStats, generateQuestionsForSubItem]);

  // Initialize session: only when we have a real (non-pending) topic
  useEffect(() => {
    if (!currentTopic || isInitialized) return;
    // Wait for streaming to finish — pending topics don't have real DB IDs yet
    if (currentTopic.id.startsWith("pending_")) return;

    setIsInitialized(true);
    checkAndUpdateStreak();

    const init = async () => {
      await new Promise((r) => setTimeout(r, 100));

      try {
        logger.info("session", `Hydrating stats for topic "${currentTopic.name}"`);
        const res = await fetch(`/api/stats?topicId=${currentTopic.id}`);
        if (res.ok) {
          const data = await res.json();
          hydrateSubItemStats(data.stats);
          logger.debug("session", "Stats hydrated", data.stats);
        }
      } catch {
        logger.warn("session", "Stats hydration failed — will rebuild from current session");
      }

      if (questionQueue.length === 0) {
        await fillQueue();
      }
    };

    init();
  }, [currentTopic, isInitialized, questionQueue.length, fillQueue, hydrateSubItemStats, checkAndUpdateStreak]);

  // Auto-advance to first question when queue fills
  useEffect(() => {
    if (!currentQuestion && questionQueue.length > 0) {
      advanceQueue();
    }
  }, [currentQuestion, questionQueue.length, advanceQueue]);

  // Refill queue when it drops below trigger
  useEffect(() => {
    const totalActive = questionQueue.length + (currentQuestion ? 1 : 0);
    if (
      isInitialized &&
      totalActive <= settings.refillTrigger &&
      !isGenerating &&
      !generatingRef.current
    ) {
      fillQueue();
    }
  }, [questionQueue.length, currentQuestion, settings.refillTrigger, isGenerating, isInitialized, fillQueue]);

  const handleAnswer = async (answer: string, timeSpent: number) => {
    if (!currentQuestion || answerShown) return;

    const isTimeout = answer === "__timeout__";
    const isCorrect = isTimeout
      ? false
      : currentQuestion.type === "fill_blank"
      ? answer.toLowerCase().trim() === currentQuestion.answer.toLowerCase().trim()
      : answer === currentQuestion.answer;

    logger.info("session", `Answer submitted`, { questionId: currentQuestion.id, correct: isCorrect, timeSpent });
    setUserAnswer(isTimeout ? "" : answer);
    setLastAnswerCorrect(isCorrect);
    setAnswerShown(true);
    setAnswerCount((c) => c + 1);

    // Gamification: XP + lives
    if (isCorrect) {
      const xpGain = Math.round(10 * (currentQuestion.difficulty || 1) * Math.min(2, 1 + streak * 0.05));
      addXP(xpGain);
      const popupId = Date.now();
      setXpPopups((prev) => [...prev, { id: popupId, amount: xpGain }]);
      setTimeout(() => {
        setXpPopups((prev) => prev.filter((p) => p.id !== popupId));
      }, 1400);
    } else {
      loseLife();
      // Show game-over after a short delay so the answer feedback is visible
      setTimeout(() => {
        if (useAppStore.getState().lives === 0) {
          setShowGameOver(true);
        }
      }, 800);
    }

    // Record answer to server
    try {
      const res = await fetch("/api/record-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          subItemId: currentQuestion.subItemId,
          sessionId,
          correct: isCorrect,
          timeSpent,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const prevDifficulty = subItemStats[currentQuestion.subItemId]?.difficulty || 1;
        updateSubItemStats(currentQuestion.subItemId, isCorrect, data.newDifficulty);

        // Confetti on level-up
        if (isCorrect && data.newDifficulty > prevDifficulty) {
          import("canvas-confetti").then(({ default: confetti }) => {
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 },
              colors: ["#818CF8", "#38BDF8", "#60A5FA", "#FACC15"],
            });
          });
        }
      }
    } catch (err) {
      console.error("Error recording answer:", err);
      const subItem = getAllSubItems().find((s) => s.id === currentQuestion.subItemId);
      updateSubItemStats(currentQuestion.subItemId, isCorrect, subItem?.difficulty || 1);
    }
  };

  const handleNext = () => {
    advanceQueue();
    setUserAnswer("");
  };

  const handleToggleMute = async (id: string, type: "item" | "subitem") => {
    if (type === "item") {
      toggleItemMute(id);
    } else {
      toggleSubItemMute(id);
    }

    try {
      await fetch("/api/toggle-mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
    } catch (err) {
      console.error("Error toggling mute:", err);
    }
  };

  if (!currentTopic) {
    return null;
  }

  const correctCount = Object.values(subItemStats).reduce((sum, s) => sum + s.correctCount, 0);
  const totalCount = Object.values(subItemStats).reduce((sum, s) => sum + s.totalCount, 0);
  const overallRate = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const isPending = currentTopic.id.startsWith("pending_");

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: "#09090E" }}
    >
      {/* Game over overlay */}
      <AnimatePresence>
        {showGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(9,9,14,0.92)", backdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="flex flex-col items-center gap-6 p-10 rounded-2xl text-center max-w-sm"
              style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
            >
              <div className="text-5xl">💔</div>
              <div>
                <h2 className="text-2xl font-bold mb-2" style={{ color: "#EEEEFF" }}>
                  Out of lives!
                </h2>
                <p className="text-sm" style={{ color: "#9494B8" }}>
                  You answered {answerCount} questions this session.
                </p>
              </div>
              <div className="flex flex-col gap-3 w-full">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    resetLives();
                    setShowGameOver(false);
                  }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white" }}
                >
                  Continue anyway
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => router.push("/")}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#1C1C28", color: "#9494B8", border: "1px solid #2E2E40" }}
                >
                  New topic
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: "#09090E", borderBottom: "1px solid #2E2E40" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-sm font-bold transition-colors"
            style={{ color: "#818CF8" }}
          >
            Dystoppia
          </button>
          <span style={{ color: "#2E2E40" }}>/</span>
          <span className="text-sm truncate max-w-[160px]" style={{ color: "#EEEEFF" }}>
            {currentTopic.name}
          </span>
          {isPending && (
            <span className="text-xs px-2 py-0.5 rounded-full animate-pulse" style={{ backgroundColor: "rgba(129,140,248,0.15)", color: "#818CF8" }}>
              loading...
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Session XP */}
          {sessionXP > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#FACC15" }}>
              <span>⚡</span>
              <span>{sessionXP} XP</span>
            </div>
          )}

          {/* Streak */}
          {streak > 1 && (
            <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#F97316" }}>
              <span>🔥</span>
              <span>{streak}</span>
            </div>
          )}

          {/* Lives */}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: maxLives }).map((_, i) => (
              <span key={i} className="text-sm" style={{ filter: i < lives ? "none" : "grayscale(1) opacity(0.3)" }}>
                ❤️
              </span>
            ))}
          </div>

          {/* Session accuracy */}
          {totalCount > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "#9494B8" }}>Session:</span>
              <span className="font-semibold" style={{ color: overallRate >= 70 ? "#60A5FA" : overallRate >= 40 ? "#FACC15" : "#F97316" }}>
                {overallRate}%
              </span>
              <span style={{ color: "#9494B8" }}>({totalCount} answered)</span>
            </div>
          )}

          <a
            href="/settings"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#9494B8" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </a>
        </div>
      </header>

      {/* Conveyor belt */}
      <ConveyorBelt
        queue={questionQueue}
        currentQuestion={currentQuestion}
        isGenerating={isGenerating}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside
          className="w-72 flex-shrink-0 overflow-y-auto p-4 hidden md:block"
          style={{
            backgroundColor: "#09090E",
            borderRight: "1px solid #2E2E40",
          }}
        >
          <div className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#9494B8" }}>
              Learning Tree
            </h2>
            <p className="text-xs" style={{ color: "#9494B8" }}>
              Click the mute icon to skip topics
            </p>
          </div>
          <TopicDashboard
            items={currentTopic.items}
            subItemStats={subItemStats}
            onToggleMute={handleToggleMute}
          />
        </aside>

        {/* Center — Question area */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative">
            {/* XP popups */}
            <div className="absolute top-4 right-4 pointer-events-none">
              <AnimatePresence>
                {xpPopups.map((popup) => (
                  <motion.div
                    key={popup.id}
                    initial={{ opacity: 1, y: 0, scale: 1 }}
                    animate={{ opacity: 0, y: -60, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="text-sm font-bold mb-1"
                    style={{ color: "#FACC15" }}
                  >
                    +{popup.amount} XP
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {currentQuestion ? (
                <div key={currentQuestion.id} className="w-full max-w-2xl">
                  <QuestionCard
                    question={currentQuestion}
                    onAnswer={handleAnswer}
                    answerShown={answerShown}
                    lastAnswerCorrect={lastAnswerCorrect}
                    userAnswer={userAnswer}
                  />

                  {/* Next button */}
                  <AnimatePresence>
                    {answerShown && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-6 flex justify-center"
                      >
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleNext}
                          className="px-8 py-3 rounded-xl font-semibold text-sm flex items-center gap-2"
                          style={{ backgroundColor: "#818CF8", color: "white" }}
                        >
                          Next Question
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full max-w-2xl space-y-4"
                >
                  <div
                    className="p-6 rounded-xl space-y-3"
                    style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                  >
                    <SkeletonBlock width="30%" height="1.25rem" />
                    <SkeletonBlock width="100%" height="1.5rem" />
                    <SkeletonBlock width="80%" height="1.5rem" />
                  </div>
                  {[0, 1, 2, 3].map((i) => (
                    <SkeletonBlock key={i} height="3rem" className="rounded-lg" />
                  ))}
                  <div className="flex justify-center pt-4">
                    <motion.p
                      className="text-sm flex items-center gap-2"
                      style={{ color: "#9494B8" }}
                    >
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        className="inline-block"
                      >
                        ✦
                      </motion.span>
                      {isPending
                        ? "Loading topic..."
                        : isGenerating
                        ? "Generating questions..."
                        : "Loading..."}
                    </motion.p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Answer count strip */}
          {answerCount > 0 && (
            <div
              className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-xs"
              style={{
                borderTop: "1px solid #2E2E40",
                color: "#9494B8",
              }}
            >
              <span className="font-bold" style={{ color: "#FACC15" }}>
                {answerCount}
              </span>{" "}
              questions answered this session
              {totalCount > 0 && (
                <>
                  <span>·</span>
                  <span
                    className="font-bold"
                    style={{ color: overallRate >= 70 ? "#60A5FA" : "#F97316" }}
                  >
                    {overallRate}%
                  </span>{" "}
                  correct
                </>
              )}
              {xp > 0 && (
                <>
                  <span>·</span>
                  <span className="font-bold" style={{ color: "#FACC15" }}>
                    ⚡ {xp} XP total
                  </span>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
