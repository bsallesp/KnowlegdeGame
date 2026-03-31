"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";
import { useRequireUser } from "@/lib/useRequireUser";
import TopicDashboard from "@/components/TopicDashboard";
import QuestionCard from "@/components/QuestionCard";
import SkeletonBlock from "@/components/ui/SkeletonBlock";
import AchievementToast from "@/components/AchievementToast";
import SessionSummary from "@/components/SessionSummary";
import RateLimitPaywall from "@/components/RateLimitPaywall";
import DailyGoalBar from "@/components/DailyGoalBar";
import BossRound from "@/components/BossRound";
import FlashCard from "@/components/FlashCard";
import InfoButton from "@/components/InfoButton";
import AudiobookPlayer from "@/components/AudiobookPlayer";
import AudiobookDialog, { type AudiobookEntry } from "@/components/AudiobookDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { selectNextSubItem } from "@/lib/adaptive";
import { logger } from "@/lib/logger";
import type { Question } from "@/types";

interface XPPopup {
  id: number;
  amount: number;
}

const BOSS_EVERY = 10; // trigger boss round every N answers
const BOSS_QUESTIONS = 3; // number of boss questions per round

export default function SessionPage() {
  const { loading: authLoading } = useRequireUser();
  const router = useRouter();
  const {
    _hasHydrated,
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
    weeklyUsage,
    weeklyRemaining,
    weeklyResetsAt,
    plan,
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
    checkAchievements,
    incrementDailyProgress,
    saveSessionEntry,
  } = useAppStore();

  const [userAnswer, setUserAnswer] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [xpPopups, setXpPopups] = useState<XPPopup[]>([]);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ window: "hourly" | "weekly"; resetsAt: string | null }>({ window: "hourly", resetsAt: null });
  const [showBossIntro, setShowBossIntro] = useState(false);
  const [isBossGenerating, setIsBossGenerating] = useState(false);
  const [isBossRound, setIsBossRound] = useState(false);
  const [bossQuestionsLeft, setBossQuestionsLeft] = useState(0);
  const [showFlashCard, setShowFlashCard] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);
  const [lastSubItemId, setLastSubItemId] = useState<string | null>(null);
  const [audiobookEntries, setAudiobookEntries] = useState<AudiobookEntry[]>([]);
  const [activeAudiobook, setActiveAudiobook] = useState<AudiobookEntry | null>(null);
  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [audiobookDialog, setAudiobookDialog] = useState<{ id: string; type: "item" | "subitem"; label: string } | null>(null);
  const [showMobileStats, setShowMobileStats] = useState(false);
  const [showMobileTree, setShowMobileTree] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const generatingRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Redirect if no topic — only after hydration to avoid false redirects on refresh
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!currentTopic) router.push("/");
  }, [_hasHydrated, currentTopic, router]);

  const getAllSubItems = useCallback(() => {
    if (!currentTopic) return [];
    return currentTopic.items.flatMap((item) => (item.muted ? [] : item.subItems));
  }, [currentTopic]);

  const generateQuestionsForSubItem = useCallback(
    async (subItemId: string, count: number, forceDifficulty?: number) => {
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
            difficulty: forceDifficulty ?? subItem.difficulty,
            count,
            stats,
          }),
        });

        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          setRateLimitInfo({ window: body.window ?? "hourly", resetsAt: body.resetsAt ?? null });
          setShowPaywall(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to generate questions");
        const data = await res.json();
        const questionsWithSubItem: Question[] = data.questions.map((q: Question) => ({ ...q, subItem }));
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
      await generateQuestionsForSubItem(subItemId, Math.min(needed, 5));
    } finally {
      generatingRef.current = false;
    }
  }, [getAllSubItems, questionQueue.length, settings.queueDepth, subItemStats, generateQuestionsForSubItem]);

  // Initialize session
  useEffect(() => {
    if (!currentTopic || isInitialized) return;
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
        }
      } catch {
        logger.warn("session", "Stats hydration failed");
      }
      if (questionQueue.length === 0) await fillQueue();
    };
    init();
  }, [currentTopic, isInitialized, questionQueue.length, fillQueue, hydrateSubItemStats, checkAndUpdateStreak]);

  // Auto-advance to first question
  useEffect(() => {
    const state = useAppStore.getState();
    if (!state.currentQuestion && state.questionQueue.length > 0) {
      advanceQueue();
    }
  }, [currentQuestion, questionQueue.length, advanceQueue]);

  // Refill queue
  useEffect(() => {
    const totalActive = questionQueue.length + (currentQuestion ? 1 : 0);
    if (isInitialized && totalActive <= settings.refillTrigger && !isGenerating && !generatingRef.current) {
      fillQueue();
    }
  }, [questionQueue.length, currentQuestion, settings.refillTrigger, isGenerating, isInitialized, fillQueue]);

  // Show flashcard when subItem changes
  useEffect(() => {
    if (!currentQuestion || answerShown) return;
    const subItemId = currentQuestion.subItemId;
    if (subItemId !== lastSubItemId && currentQuestion.subItem) {
      setLastSubItemId(subItemId);
      setPendingQuestion(currentQuestion);
      setShowFlashCard(true);
    }
  }, [currentQuestion?.id]);

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
    if (isCorrect) setSessionCorrect((c) => c + 1);

    // XP: boss round = double
    const xpMultiplier = isBossRound ? 2 : 1;
    if (isCorrect) {
      const xpGain = Math.round(10 * (currentQuestion.difficulty || 1) * Math.min(2, 1 + streak * 0.05) * xpMultiplier);
      addXP(xpGain);
      const popupId = Date.now();
      setXpPopups((prev) => [...prev, { id: popupId, amount: xpGain }]);
      setTimeout(() => setXpPopups((prev) => prev.filter((p) => p.id !== popupId)), 1400);
    } else {
      loseLife();
      setTimeout(() => {
        if (useAppStore.getState().lives === 0) setShowGameOver(true);
      }, 800);
    }

    // Achievements + daily goal
    incrementDailyProgress();
    checkAchievements({ correct: isCorrect, timeSpent, usedHint: false });

    // Boss round tracking
    if (isBossRound) {
      const left = bossQuestionsLeft - 1;
      setBossQuestionsLeft(left);
      if (left <= 0) {
        setIsBossRound(false);
        useAppStore.getState().checkAchievements({ bossCompleted: true });
      }
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
        if (isCorrect && data.newDifficulty > prevDifficulty) {
          import("canvas-confetti").then(({ default: confetti }) => {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ["#818CF8", "#38BDF8", "#60A5FA", "#FACC15"] });
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
    const newCount = answerCount; // already incremented
    // Trigger boss round every BOSS_EVERY answers (not while already in boss)
    if (!isBossRound && newCount > 0 && newCount % BOSS_EVERY === 0) {
      setShowBossIntro(true);
    } else {
      advanceQueue();
    }
    setUserAnswer("");
  };

  const handleBossReady = async () => {
    if (isBossGenerating) return;
    setIsBossGenerating(true);
    setIsBossRound(true);
    setBossQuestionsLeft(BOSS_QUESTIONS);

    // Generate max-difficulty questions for boss
    const subItems = getAllSubItems().filter((s) => !s.muted);
    if (subItems.length > 0) {
      const subItemId = selectNextSubItem(subItems, subItemStats);
      if (subItemId) {
        await generateQuestionsForSubItem(subItemId, BOSS_QUESTIONS, 5);
      }
    }

    // Dismiss intro only after questions are ready — prevents the previously-answered
    // question from flashing briefly while the API call is in flight.
    setShowBossIntro(false);
    setIsBossGenerating(false);
    advanceQueue();
  };

  const handleToggleMute = async (id: string, type: "item" | "subitem") => {
    if (type === "item") toggleItemMute(id);
    else toggleSubItemMute(id);
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

  const handleShowSummary = () => {
    if (currentTopic) {
      saveSessionEntry({
        correctCount: sessionCorrect,
        totalCount: answerCount,
        xpEarned: sessionXP,
        topicId: currentTopic.id,
      });
    }
    setShowSummary(true);
  };

  const handleGenerateAudiobook = async (scopeId: string, scopeType: "item" | "subitem") => {
    if (!currentTopic || isGeneratingAudiobook) return;
    setIsGeneratingAudiobook(true);
    setAudiobookError(null);
    try {
      const res = await fetch("/api/audiobook/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: currentTopic.id,
          ...(scopeType === "item" ? { itemId: scopeId } : { subItemId: scopeId }),
          subItemStats,
        }),
      });
      if (res.status === 403) {
        setAudiobookError("Audiobook is available on Learner and Master plans.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.details ?? data.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const entry: AudiobookEntry = {
        id: crypto.randomUUID(),
        scopeId,
        scopeType,
        scopeLabel: audiobookDialog?.label ?? scopeId,
        url,
        createdAt: new Date(),
      };
      setAudiobookEntries((prev) => [entry, ...prev]);
      setActiveAudiobook(entry);
    } catch (err) {
      logger.error("session", "Audiobook generation failed", err);
      setAudiobookError(String(err));
      setTimeout(() => setAudiobookError(null), 5000);
    } finally {
      setIsGeneratingAudiobook(false);
    }
  };

  if (!currentTopic) return null;

  const correctCount = Object.values(subItemStats).reduce((sum, s) => sum + s.correctCount, 0);
  const totalCount = Object.values(subItemStats).reduce((sum, s) => sum + s.totalCount, 0);
  const overallRate = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const isPending = currentTopic.id.startsWith("pending_");

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#09090E" }}>
      {/* Achievement toasts */}
      <AchievementToast />

      {/* 60% weekly usage nudge — only for free plan */}
      <AnimatePresence>
        {plan === "free" && weeklyUsage > 0 && weeklyRemaining / (weeklyUsage + weeklyRemaining) <= 0.4 && weeklyRemaining > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="flex items-center justify-between px-4 py-2 text-xs"
            style={{ backgroundColor: "rgba(129,140,248,0.1)", borderBottom: "1px solid rgba(129,140,248,0.2)" }}
          >
            <span style={{ color: "#9494B8" }}>
              {weeklyRemaining} questions left this week
            </span>
            <a
              href="/pricing"
              className="font-semibold px-3 py-1 rounded-lg text-xs transition-all"
              style={{ backgroundColor: "#818CF8", color: "#09090E" }}
            >
              Upgrade
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rate limit paywall */}
      <AnimatePresence>
        {showPaywall && (
          <RateLimitPaywall
            window={rateLimitInfo.window}
            resetsAt={rateLimitInfo.resetsAt}
            onClose={() => setShowPaywall(false)}
          />
        )}
      </AnimatePresence>

      {/* Game over overlay */}
      <AnimatePresence>
        {showGameOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(9,9,14,0.92)", backdropFilter: "blur(8px)" }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 20 }}
              className="flex flex-col items-center gap-6 p-10 rounded-2xl text-center max-w-sm"
              style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
            >
              <div className="text-5xl">💔</div>
              <div>
                <h2 className="text-2xl font-bold mb-2" style={{ color: "#EEEEFF" }}>Out of lives!</h2>
                <p className="text-sm" style={{ color: "#9494B8" }}>You answered {answerCount} questions this session.</p>
              </div>
              <div className="flex flex-col gap-3 w-full">
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { resetLives(); setShowGameOver(false); }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#818CF8", color: "white" }}>
                  Continue anyway
                </motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={handleShowSummary}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#1C1C28", color: "#9494B8", border: "1px solid #2E2E40" }}>
                  View summary
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boss round intro */}
      <AnimatePresence>
        {showBossIntro && <BossRound onReady={handleBossReady} isLoading={isBossGenerating} />}
      </AnimatePresence>

      {/* Session summary */}
      {showSummary && (
        <SessionSummary
          answerCount={answerCount}
          correctCount={sessionCorrect}
          sessionXP={sessionXP}
          topicName={currentTopic.name}
          onContinue={() => setShowSummary(false)}
          onNewTopic={() => router.push("/")}
        />
      )}

      {/* Top bar */}
      <header
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: "#09090E", borderBottom: "1px solid #2E2E40" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="flex items-center gap-2 text-sm font-bold transition-colors" style={{ color: "#818CF8" }}>
            Dystoppia
          </button>
          <span style={{ color: "#2E2E40" }}>/</span>
          <span className="text-sm truncate max-w-[160px]" style={{ color: "#EEEEFF" }}>{currentTopic.name}</span>
          {isPending && (
            <span className="text-xs px-2 py-0.5 rounded-full animate-pulse" style={{ backgroundColor: "rgba(129,140,248,0.15)", color: "#818CF8" }}>loading...</span>
          )}
          {isBossRound && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold animate-pulse" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
              ⚔️ BOSS ({bossQuestionsLeft})
              <InfoButton
                title="Boss Round"
                content="Every 10 answers, 3 maximum-difficulty questions appear with 2× XP. Answer all 3 to earn the Boss Slayer achievement."
                side="below"
              />
            </span>
          )}
        </div>

        {/* Desktop stats bar */}
        <div className="hidden sm:flex items-center gap-4">
          {/* Weekly usage */}
          <div
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: weeklyRemaining <= 6 ? "#F97316" : "#818CF8" }}
          >
            <span>⚡</span>
            <span>{weeklyRemaining} left this week</span>
            <InfoButton
              title="Weekly Questions"
              content="How many AI-generated questions you have left this week. The counter resets every 7 days. Upgrade your plan for a higher limit."
              side="below"
            />
          </div>

          {/* Daily goal */}
          <DailyGoalBar />

          {/* Session XP */}
          {sessionXP > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#FACC15" }}>
              <span>⚡</span><span>{sessionXP} XP</span>
              <InfoButton
                title="Session XP"
                content="XP earned this session. Correct answers give 10 × difficulty × streak bonus. Boss Round questions give 2× XP."
                side="below"
              />
            </div>
          )}

          {/* Streak */}
          {streak > 1 && (
            <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#F97316" }}>
              <span>🔥</span><span>{streak}</span>
              <InfoButton
                title="Daily Streak"
                content="Consecutive days you've studied. Miss a day and it resets to 1. Reach 7 days to earn the Strong Week achievement."
                side="below"
              />
            </div>
          )}

          {/* Lives */}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: maxLives }).map((_, i) => (
              <span key={i} className="text-sm" style={{ filter: i < lives ? "none" : "grayscale(1) opacity(0.3)" }}>❤️</span>
            ))}
            <InfoButton
              title="Lives"
              content="You have 3 lives per session. Each wrong answer costs one life. Run out and you'll see Game Over — but you can always continue anyway."
              side="below"
            />
          </div>

          {/* Session accuracy */}
          {totalCount > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "#9494B8" }}>Session:</span>
              <span className="font-semibold" style={{ color: overallRate >= 70 ? "#60A5FA" : overallRate >= 40 ? "#FACC15" : "#F97316" }}>
                {overallRate}%
              </span>
              <span style={{ color: "#9494B8" }}>({totalCount} answered)</span>
              <InfoButton
                title="Session Accuracy"
                content="Percentage of correct answers so far this session. The app uses this — along with time spent — to adapt question difficulty per concept."
                side="below"
              />
            </div>
          )}

          {/* Summary button */}
          {answerCount >= 5 && (
            <button
              onClick={handleShowSummary}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: "#9494B8", border: "1px solid #2E2E40" }}
            >
              Summary
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSettingsDialog(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "#9494B8" }}
            aria-label="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Mobile compact bar */}
        <div className="flex sm:hidden items-center gap-2">
          {streak > 1 && (
            <span className="text-xs font-semibold" style={{ color: "#F97316" }}>🔥{streak}</span>
          )}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: maxLives }).map((_, i) => (
              <span key={i} className="text-xs" style={{ filter: i < lives ? "none" : "grayscale(1) opacity(0.3)" }}>❤️</span>
            ))}
          </div>
          <button
            onClick={() => setShowMobileStats((v) => !v)}
            className="p-1.5 rounded-lg"
            style={{ color: showMobileStats ? "#818CF8" : "#9494B8", backgroundColor: showMobileStats ? "rgba(129,140,248,0.1)" : "transparent" }}
            aria-label="Stats"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowSettingsDialog(true)}
            className="p-1.5 rounded-lg"
            style={{ color: "#9494B8" }}
            aria-label="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile stats panel */}
      <AnimatePresence>
        {showMobileStats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="sm:hidden overflow-hidden flex-shrink-0"
            style={{ backgroundColor: "#12121A", borderBottom: "1px solid #2E2E40" }}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: weeklyRemaining <= 6 ? "#F97316" : "#818CF8" }}>
                <span>⚡</span><span>{weeklyRemaining} left this week</span>
              </div>
              <DailyGoalBar />
              {sessionXP > 0 && (
                <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#FACC15" }}>
                  <span>⚡</span><span>{sessionXP} XP</span>
                </div>
              )}
              {totalCount > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <span style={{ color: "#9494B8" }}>Session:</span>
                  <span className="font-semibold" style={{ color: overallRate >= 70 ? "#60A5FA" : overallRate >= 40 ? "#FACC15" : "#F97316" }}>{overallRate}%</span>
                  <span style={{ color: "#9494B8" }}>({totalCount})</span>
                </div>
              )}
              {answerCount >= 5 && (
                <button
                  onClick={() => { handleShowSummary(); setShowMobileStats(false); }}
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ color: "#9494B8", border: "1px solid #2E2E40" }}
                >
                  Summary
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audiobook dialog */}
      {audiobookDialog && (
        <AudiobookDialog
          open={!!audiobookDialog}
          onClose={() => setAudiobookDialog(null)}
          scopeLabel={audiobookDialog.label}
          audios={audiobookEntries.filter((e) => e.scopeId === audiobookDialog.id)}
          isGenerating={isGeneratingAudiobook}
          onGenerate={() => handleGenerateAudiobook(audiobookDialog.id, audiobookDialog.type)}
          onPlay={(entry) => setActiveAudiobook(entry)}
        />
      )}

      <SettingsDialog open={showSettingsDialog} onClose={() => setShowSettingsDialog(false)} />

      {/* Audiobook generating toast */}
      <AnimatePresence>
        {isGeneratingAudiobook && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
          >
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} className="inline-block">🎧</motion.span>
            <span className="text-sm" style={{ color: "#EEEEFF" }}>Gerando audiobook personalizado...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audiobook error toast */}
      <AnimatePresence>
        {audiobookError && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl max-w-sm"
            style={{ backgroundColor: "#12121A", border: "1px solid #F97316", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
          >
            <span className="text-lg">⚠️</span>
            <span className="text-sm" style={{ color: "#F97316" }}>Falha: {audiobookError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audiobook player */}
      {activeAudiobook && (
        <AudiobookPlayer
          audioUrl={activeAudiobook.url}
          onClose={() => setActiveAudiobook(null)}
        />
      )}

      {/* Mobile learning tree drawer */}
      <AnimatePresence>
        {showMobileTree && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ backgroundColor: "rgba(9,9,14,0.7)", backdropFilter: "blur(4px)" }}
              onClick={() => setShowMobileTree(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-72 overflow-y-auto p-4 md:hidden"
              style={{ backgroundColor: "#09090E", borderRight: "1px solid #2E2E40" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#9494B8" }}>Learning Tree</h2>
                    <InfoButton
                      title="Learning Tree"
                      content="Your curriculum organized by chapters and concepts. ⚠ = weak spot (< 50% correct, 3+ attempts). ✓ = mastered (≥ 80%, 10+ attempts). Mute any item to skip it."
                      side="below"
                    />
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "#9494B8" }}>⚠ = weak spot &nbsp; ✓ = mastered</p>
                </div>
                <button onClick={() => setShowMobileTree(false)} className="p-1 rounded" style={{ color: "#9494B8" }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <TopicDashboard
                items={currentTopic.items}
                subItemStats={subItemStats}
                onToggleMute={handleToggleMute}
                onOpenAudiobooks={isPending ? undefined : (id, type, label) => { setAudiobookDialog({ id, type, label }); setShowMobileTree(false); }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile floating tree button */}
      <button
        onClick={() => setShowMobileTree(true)}
        className="fixed bottom-6 left-4 z-30 md:hidden flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold shadow-lg"
        style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        Tree
      </button>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto p-4 hidden md:block" style={{ backgroundColor: "#09090E", borderRight: "1px solid #2E2E40" }}>
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#9494B8" }}>Learning Tree</h2>
              <InfoButton
                title="Learning Tree"
                content="Your curriculum organized by chapters and concepts. ⚠ = weak spot (< 50% correct, 3+ attempts). ✓ = mastered (≥ 80%, 10+ attempts). Mute any item to skip it."
              />
            </div>
            <p className="text-xs" style={{ color: "#9494B8" }}>⚠ = weak spot &nbsp; ✓ = mastered</p>
          </div>
          <TopicDashboard
            items={currentTopic.items}
            subItemStats={subItemStats}
            onToggleMute={handleToggleMute}
            onOpenAudiobooks={isPending ? undefined : (id, type, label) => setAudiobookDialog({ id, type, label })}
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
                    style={{ color: isBossRound ? "#EF4444" : "#FACC15" }}
                  >
                    +{popup.amount} XP{isBossRound ? " 🗡️" : ""}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {/* Flashcard before new subItem */}
              {showFlashCard && pendingQuestion?.subItem && (
                <motion.div key="flashcard" className="w-full max-w-2xl">
                  <FlashCard
                    subItem={pendingQuestion.subItem}
                    topicName={currentTopic.name}
                    onReady={() => setShowFlashCard(false)}
                  />
                </motion.div>
              )}

              {/* Question card */}
              {!showFlashCard && currentQuestion ? (
                <div key={currentQuestion.id} className="w-full max-w-2xl">
                  <QuestionCard
                    question={currentQuestion}
                    onAnswer={handleAnswer}
                    answerShown={answerShown}
                    lastAnswerCorrect={lastAnswerCorrect}
                    userAnswer={userAnswer}
                    xp={xp}
                    topicName={currentTopic.name}
                    onHintUsed={() => {
                      addXP(-5);
                      checkAchievements({ usedHint: true });
                    }}
                  />

                  {/* Next button */}
                  <AnimatePresence>
                    {answerShown && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-6 flex justify-center"
                      >
                        <motion.button
                          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={handleNext}
                          className="px-8 py-3 rounded-xl font-semibold text-sm flex items-center gap-2"
                          style={{ backgroundColor: isBossRound ? "#EF4444" : "#818CF8", color: "white" }}
                        >
                          {isBossRound ? "⚔️ Next Boss" : "Next Question"}
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : !showFlashCard ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-2xl space-y-4">
                  <div className="p-6 rounded-xl space-y-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                    <SkeletonBlock width="30%" height="1.25rem" />
                    <SkeletonBlock width="100%" height="1.5rem" />
                    <SkeletonBlock width="80%" height="1.5rem" />
                  </div>
                  {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height="3rem" className="rounded-lg" />)}
                  <div className="flex justify-center pt-4">
                    <motion.p className="text-sm flex items-center gap-2" style={{ color: "#9494B8" }}>
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="inline-block">✦</motion.span>
                      {isPending ? "Loading topic..." : isGenerating ? "Generating questions..." : "Loading..."}
                    </motion.p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Answer count strip */}
          {answerCount > 0 && (
            <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-xs" style={{ borderTop: "1px solid #2E2E40", color: "#9494B8" }}>
              <span className="font-bold" style={{ color: "#FACC15" }}>{answerCount}</span> questions answered this session
              {totalCount > 0 && (
                <><span>·</span>
                <span className="font-bold" style={{ color: overallRate >= 70 ? "#60A5FA" : "#F97316" }}>{overallRate}%</span> correct</>
              )}
              {xp > 0 && (
                <><span>·</span>
                <span className="font-bold" style={{ color: "#FACC15" }}>⚡ {xp} XP total</span></>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

