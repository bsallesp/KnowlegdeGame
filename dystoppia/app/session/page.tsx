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
import BossRound from "@/components/BossRound";
import FlashCard from "@/components/FlashCard";
import InfoButton from "@/components/InfoButton";
import AudiobookPlayer from "@/components/AudiobookPlayer";
import AudiobookDialog, { type AudiobookEntry } from "@/components/AudiobookDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { selectNextSubItem, selectTopNSubItems } from "@/lib/adaptive";
import { logger } from "@/lib/clientLogger";
import type { Question } from "@/types";

const LOADING_FACTS = [
  "Spaced repetition can improve long-term retention by up to 200% compared to massed practice.",
  "The brain consolidates memories during sleep — studying before bed boosts recall the next day.",
  "Retrieval practice (testing yourself) is more effective than re-reading the same material.",
  "Interleaving different topics in one session leads to deeper understanding than blocked practice.",
  "The 'generation effect': information you produce yourself is remembered far better than passively read text.",
  "Taking brief breaks every 25–30 minutes keeps focus sharp and prevents cognitive fatigue.",
  "Teaching a concept to someone else is one of the strongest ways to solidify your own understanding.",
  "Handwriting notes activates deeper processing than typing, even if you write less.",
  "Connecting new knowledge to something you already know speeds up encoding by up to 40%.",
  "Curiosity releases dopamine, which acts as a natural memory enhancer — stay curious!",
];

function LoadingFactCard({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * LOADING_FACTS.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (error) return;
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % LOADING_FACTS.length);
        setVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(cycle);
  }, [error]);

  return (
    <motion.div key="loading-fact" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8 flex flex-col items-center gap-5"
        style={{ backgroundColor: "#12121A", border: "1px solid rgba(129,140,248,0.3)" }}
      >
        <span className="text-3xl select-none">{error ? "⚠️" : "💡"}</span>
        <motion.p
          key={idx}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{ duration: 0.35 }}
          className="text-center text-base leading-relaxed max-w-md"
          style={{ color: "#C7C7E0" }}
        >
          {error ?? LOADING_FACTS[idx]}
        </motion.p>
        {error ? (
          onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 px-5 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "#818CF8", color: "white" }}
            >
              Try Again
            </button>
          )
        ) : (
          <div className="mt-1 flex items-center gap-2" style={{ color: "#6060A0" }}>
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="inline-block text-xs">✦</motion.span>
            <span className="text-xs">Generating questions…</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface XPPopup {
  id: number;
  amount: number;
}

function FactOverlay({ fact, onDismiss, ready }: { fact: string; onDismiss: () => void; ready: boolean }) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const canContinue = ready && elapsed;

  return (
    <motion.div
      key="fact-overlay"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div
        className="rounded-xl p-8 flex flex-col items-center gap-5"
        style={{ backgroundColor: "#12121A", border: "1px solid rgba(129,140,248,0.3)" }}
      >
        <span className="text-3xl select-none">💡</span>
        <p className="text-center text-base leading-relaxed max-w-md" style={{ color: "#C7C7E0" }}>
          {fact}
        </p>
        {canContinue ? (
          <button
            onClick={onDismiss}
            className="mt-1 text-xs px-5 py-2 rounded-lg transition-colors"
            style={{ color: "#9494B8", border: "1px solid #2E2E40", backgroundColor: "#1C1C28" }}
          >
            Continue
          </button>
        ) : (
          <div className="mt-1 flex items-center gap-2" style={{ color: "#6060A0" }}>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            <span className="text-xs">Loading next question…</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface AnswerMeta {
  questionId: string;
  subItemId: string;
  correct: boolean;
  xpAwarded: number;
  wasBossRound: boolean;
  bossQuestionsLeftBefore: number;
}

type QuestionReportState = "idle" | "submitting" | "submitted" | "error";

const GED_SLUG = "ged-mathematical-reasoning";
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
    setCurrentTopic,
    addToQueue,
    prependToQueue,
    advanceQueue,
    updateSubItemStats,
    setSubItemStatsEntry,
    hydrateSubItemStats,
    setIsGenerating,
    setAnswerShown,
    setLastAnswerCorrect,
    toggleItemMute,
    toggleSubItemMute,
    soloItem,
    soloSubItem,
    addXP,
    checkAchievements,
    saveSessionEntry,
  } = useAppStore();

  const [userAnswer, setUserAnswer] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [xpPopups, setXpPopups] = useState<XPPopup[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ resetsAt: string | null }>({ resetsAt: null });
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
  const [sessionError, setSessionError] = useState("");
  const [isRecoveringTopic, setIsRecoveringTopic] = useState(false);
  const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
  const [reportState, setReportState] = useState<QuestionReportState>("idle");
  const [reportMessage, setReportMessage] = useState("");
  const [lastAnswerMeta, setLastAnswerMeta] = useState<AnswerMeta | null>(null);
  const [displayingFact, setDisplayingFact] = useState<string | null>(null);
  const generatingRef = useRef(false);
  const isFetchingRef = useRef(false);
  const recoveryFetchesRef = useRef<Set<string>>(new Set());
  const reportedQuestionIdsRef = useRef<Set<string>>(new Set());
  const preflightTriggeredRef = useRef<Set<string>>(new Set());

  const syncTopicFromServer = useCallback(async () => {
    const res = await fetch(`/api/topics?slug=${encodeURIComponent(GED_SLUG)}`);
    if (!res.ok) throw new Error("Could not load GED topic");
    const topic = await res.json();
    setCurrentTopic(topic);
  }, [setCurrentTopic]);

  // Recover from stale persisted state so /session can self-heal after refreshes/redeploys.
  useEffect(() => {
    if (authLoading || !_hasHydrated) return;
    if (currentTopic && !currentTopic.id.startsWith("pending_")) return;

    let cancelled = false;

    async function recoverTopic() {
      setIsRecoveringTopic(true);
      setSessionError("");
      try {
        await syncTopicFromServer();
      } catch (error) {
        if (!cancelled) {
          setSessionError(error instanceof Error ? error.message : "Could not load GED topic");
        }
      } finally {
        if (!cancelled) {
          setIsRecoveringTopic(false);
        }
      }
    }

    void recoverTopic();

    return () => {
      cancelled = true;
    };
  }, [authLoading, _hasHydrated, currentTopic, syncTopicFromServer]);

  // Redirect if no topic — only after hydration to avoid false redirects on refresh
  useEffect(() => {
    if (authLoading || !_hasHydrated || isRecoveringTopic) return;
    if (!currentTopic) router.push("/");
  }, [authLoading, _hasHydrated, isRecoveringTopic, currentTopic, router]);

  const getAllSubItems = useCallback(() => {
    if (!currentTopic) return [];
    return currentTopic.items.flatMap((item) => (item.muted ? [] : item.subItems));
  }, [currentTopic]);

  const generateQuestionsForSubItem = useCallback(
    async (subItemId: string, count: number, forceDifficulty?: number) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsGenerating(true);
      setSessionError("");
      logger.info("session", `Generating questions for subItem ${subItemId}`, { count });

      try {
        const subItems = getAllSubItems();
        const subItem = subItems.find((s) => s.id === subItemId);
        if (!subItem) return;
        const stats = subItemStats[subItemId];

        // First-contact detection: use preflight difficulty (0) for subItems the learner
        // has never answered before. Preflight questions are ultra-simple orientation checks.
        const isFirstContact =
          forceDifficulty === undefined &&
          !preflightTriggeredRef.current.has(subItemId) &&
          (!stats || stats.totalCount === 0);

        if (isFirstContact) {
          preflightTriggeredRef.current.add(subItemId);
        }

        const resolvedDifficulty = forceDifficulty ?? (isFirstContact ? 0 : subItem.difficulty);

        const res = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subItemId,
            difficulty: resolvedDifficulty,
            count,
            stats,
          }),
        });

        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          setRateLimitInfo({ resetsAt: body.resetsAt ?? null });
          setShowPaywall(true);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { message?: unknown };
          const message = res.status === 503 && typeof body.message === "string"
            ? body.message
            : "Failed to generate questions";
          throw new Error(message);
        }
        const data = await res.json();
        const questionsWithSubItem: Question[] = data.questions.map((q: Question) => ({ ...q, subItem }));
        logger.debug("session", `Added ${questionsWithSubItem.length} questions to queue`);
        addToQueue(questionsWithSubItem);
      } catch (err) {
        logger.error("session", "Failed to generate questions", err);
        setSessionError(err instanceof Error ? err.message : "Could not load questions. Try again.");
      } finally {
        isFetchingRef.current = false;
        setIsGenerating(false);
      }
    },
    [getAllSubItems, subItemStats, addToQueue, setIsGenerating]
  );

  const queueRecoveryQuestions = useCallback(
    async (subItemId: string, targetDifficulty: number) => {
      if (recoveryFetchesRef.current.has(subItemId)) return;

      const subItems = getAllSubItems();
      const subItem = subItems.find((s) => s.id === subItemId);
      if (!subItem) return;

      recoveryFetchesRef.current.add(subItemId);

      try {
        const stats = subItemStats[subItemId];
        const res = await fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subItemId,
            difficulty: Math.max(1, targetDifficulty),
            count: 2,
            stats,
          }),
        });

        if (!res.ok) return;

        const data = await res.json();
        const questionsWithSubItem: Question[] = data.questions.map((q: Question) => ({ ...q, subItem }));
        prependToQueue(questionsWithSubItem);
      } catch (error) {
        logger.warn("session", "Could not queue recovery questions", { subItemId, error: String(error) });
      } finally {
        recoveryFetchesRef.current.delete(subItemId);
      }
    },
    [getAllSubItems, prependToQueue, subItemStats]
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

  // Fire-and-forget warmup: asks server to populate the shared question cache for
  // upcoming subItems. Does not touch `isGenerating` (no spinner) or `questionQueue`
  // (no UI effect). Server-side uses `prefetch: true` to skip quota charging.
  const prefetchSubItems = useCallback(
    (subItemIds: string[]) => {
      for (const subItemId of subItemIds) {
        if (!subItemId) continue;
        const stats = subItemStats[subItemId];
        fetch("/api/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subItemId, count: 5, stats, prefetch: true }),
          keepalive: true,
        }).catch(() => {
          // Prefetch is best-effort; swallow network errors silently.
        });
      }
    },
    [subItemStats]
  );

  // Initialize session
  useEffect(() => {
    if (!currentTopic || isInitialized) return;
    if (currentTopic.id.startsWith("pending_")) return;
    setIsInitialized(true);

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

      // Pre-warm next subItems so questions are ready before the user needs them.
      const subItems = currentTopic.items.flatMap((item) => (item.muted ? [] : item.subItems));
      const nextIds = subItems.slice(0, 4).map((s) => s.id);
      if (nextIds.length > 0) prefetchSubItems(nextIds);
    };
    init();
  }, [currentTopic, isInitialized, questionQueue.length, fillQueue, hydrateSubItemStats, prefetchSubItems]);

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
      // Warmup: while the learner reads the flashcard, pre-generate questions for the
      // most likely next subItems so their first question loads instantly on transition.
      const activeSubItems = getAllSubItems().filter((s) => !s.muted);
      const nextIds = selectTopNSubItems(activeSubItems, subItemStats, 3, [subItemId]);
      if (nextIds.length > 0) prefetchSubItems(nextIds);
    }
  }, [answerShown, currentQuestion, lastSubItemId, getAllSubItems, subItemStats, prefetchSubItems]);

  useEffect(() => {
    setReportState("idle");
    setReportMessage("");
    setIsRecordingAnswer(false);
    setLastAnswerMeta(null);
  }, [currentQuestion?.id]);

  const rollbackAnsweredQuestion = useCallback(
    (meta: AnswerMeta | null) => {
      if (!meta) return;

      setAnswerCount((count) => Math.max(0, count - 1));

      if (meta.correct) {
        setSessionCorrect((count) => Math.max(0, count - 1));
        if (meta.xpAwarded > 0) {
          addXP(-meta.xpAwarded);
        }
      }

      if (meta.wasBossRound) {
        setIsBossRound(true);
        setBossQuestionsLeft(meta.bossQuestionsLeftBefore);
      }

      setLastAnswerMeta(null);
    },
    [addXP]
  );

  const handleAnswer = async (answer: string, timeSpent: number) => {
    if (!currentQuestion || answerShown) return;

    const questionAtAnswer = currentQuestion;

    const isTimeout = answer === "__timeout__";
    const isCorrect = isTimeout
      ? false
      : questionAtAnswer.type === "fill_blank"
      ? answer.toLowerCase().trim() === questionAtAnswer.answer.toLowerCase().trim()
      : answer === questionAtAnswer.answer;

    logger.info("session", `Answer submitted`, { questionId: questionAtAnswer.id, correct: isCorrect, timeSpent });
    setUserAnswer(isTimeout ? "" : answer);
    setLastAnswerCorrect(isCorrect);
    setAnswerShown(true);
    setAnswerCount((c) => c + 1);
    if (isCorrect) setSessionCorrect((c) => c + 1);

    // XP: boss round = double
    const xpMultiplier = isBossRound ? 2 : 1;
    const xpGain = isCorrect
      ? Math.round(10 * (questionAtAnswer.difficulty || 1) * xpMultiplier)
      : 0;

    const answerMeta: AnswerMeta = {
      questionId: questionAtAnswer.id,
      subItemId: questionAtAnswer.subItemId,
      correct: isCorrect,
      xpAwarded: xpGain,
      wasBossRound: isBossRound,
      bossQuestionsLeftBefore: bossQuestionsLeft,
    };

    setLastAnswerMeta(answerMeta);

    if (isCorrect) {
      addXP(xpGain);
      const popupId = Date.now();
      setXpPopups((prev) => [...prev, { id: popupId, amount: xpGain }]);
      setTimeout(() => setXpPopups((prev) => prev.filter((p) => p.id !== popupId)), 1400);
    }

    // Achievements
    checkAchievements({ correct: isCorrect, timeSpent, usedHint: false });

    if (!isCorrect) {
      const recoveryDifficulty = Math.max(1, (subItemStats[questionAtAnswer.subItemId]?.difficulty || questionAtAnswer.difficulty || 1) - 1);
      void queueRecoveryQuestions(questionAtAnswer.subItemId, recoveryDifficulty);
    }

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
    setIsRecordingAnswer(true);
    try {
      const res = await fetch("/api/record-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: questionAtAnswer.id,
          subItemId: questionAtAnswer.subItemId,
          sessionId,
          correct: isCorrect,
          timeSpent,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to record answer");
      }

      const data = await res.json();

      if (reportedQuestionIdsRef.current.has(questionAtAnswer.id)) {
        return;
      }

      if (data.stats) {
        const prevDifficulty = subItemStats[questionAtAnswer.subItemId]?.difficulty || questionAtAnswer.difficulty || 1;
        setSubItemStatsEntry(questionAtAnswer.subItemId, data.stats);

        if (data.ignoredFlaggedQuestion) {
          reportedQuestionIdsRef.current.add(questionAtAnswer.id);
          rollbackAnsweredQuestion(answerMeta);
          setReportState("submitted");
          setReportMessage("This question had already been flagged and was removed from scoring.");
          return;
        }

        if (isCorrect && data.newDifficulty > prevDifficulty) {
          import("canvas-confetti").then(({ default: confetti }) => {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ["#818CF8", "#38BDF8", "#60A5FA", "#FACC15"] });
          });
        }
      }
    } catch (err) {
      logger.error("session", "Error recording answer", err);
      if (!reportedQuestionIdsRef.current.has(questionAtAnswer.id)) {
        const subItem = getAllSubItems().find((s) => s.id === questionAtAnswer.subItemId);
        updateSubItemStats(questionAtAnswer.subItemId, isCorrect, subItem?.difficulty || 1);
      }
    } finally {
      setIsRecordingAnswer(false);
    }
  };

  const handleReportQuestion = async () => {
    if (!currentQuestion || !answerShown || reportState === "submitting" || reportState === "submitted") {
      return;
    }

    const reportTarget = currentQuestion;
    const metaToRollback =
      lastAnswerMeta?.questionId === reportTarget.id ? lastAnswerMeta : null;

    setReportState("submitting");
    setReportMessage("");

    try {
      const res = await fetch("/api/report-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: reportTarget.id,
          subItemId: reportTarget.subItemId,
          sessionId,
          reason: lastAnswerCorrect === false
            ? "User reported a question after being marked incorrect."
            : "User reported a question from the session UI.",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to report question");
      }

      const data = await res.json();
      reportedQuestionIdsRef.current.add(reportTarget.id);

      if (data.stats) {
        setSubItemStatsEntry(reportTarget.subItemId, data.stats);
      }

      if (data.answerInvalidated) {
        rollbackAnsweredQuestion(metaToRollback);
      }

      setReportState("submitted");
      setReportMessage(
        data.answerInvalidated
          ? "Question flagged. This answer no longer counts against you."
          : "Question flagged for review."
      );
    } catch (error) {
      logger.error("session", "Failed to report question", error);
      setReportState("error");
      setReportMessage("Couldn't report this question. Please try again.");
    }
  };

  const handleNext = () => {
    const newCount = answerCount; // already incremented
    const fact = currentQuestion?.fact ?? null;

    if (!isBossRound && newCount > 0 && newCount % BOSS_EVERY === 0) {
      setShowBossIntro(true);
    } else {
      advanceQueue();
      if (fact) {
        setDisplayingFact(fact);
      }
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
      const res = await fetch("/api/toggle-mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("Error toggling mute:", err);
      try {
        await syncTopicFromServer();
      } catch (syncError) {
        logger.error("session", "Failed to re-sync topic after mute error", syncError);
      }
    }
  };

  const handleSolo = async (id: string, type: "item" | "subitem") => {
    if (type === "item") soloItem(id);
    else soloSubItem(id);

    try {
      const res = await fetch("/api/solo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("Error updating solo focus:", err);
      try {
        await syncTopicFromServer();
      } catch (syncError) {
        logger.error("session", "Failed to re-sync topic after solo error", syncError);
      }
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

  if (authLoading || !_hasHydrated || isRecoveringTopic || !currentTopic || currentTopic.id.startsWith("pending_")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#09090E" }}>
        <div className="w-full max-w-xl space-y-4">
          <div className="rounded-xl p-6 space-y-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
            <SkeletonBlock width="35%" height="1.25rem" />
            <SkeletonBlock width="100%" height="1.5rem" />
            <SkeletonBlock width="80%" height="1.5rem" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height="3rem" className="rounded-lg" />
          ))}
          <div className="flex flex-col items-center gap-3 pt-4 text-sm">
            <p className="flex items-center gap-2" style={{ color: "#9494B8" }}>
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="inline-block">✦</motion.span>
              {sessionError || "Loading your GED session..."}
            </p>
            {sessionError && (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: "#818CF8", color: "white" }}
              >
                Back To Start
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const correctCount = Object.values(subItemStats).reduce((sum, s) => sum + s.correctCount, 0);
  const totalCount = Object.values(subItemStats).reduce((sum, s) => sum + s.totalCount, 0);
  const overallRate = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const isPending = currentTopic.id.startsWith("pending_");

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: "#09090E" }}>
      {/* Achievement toasts */}
      <AchievementToast />

      {/* Rate limit paywall */}
      <AnimatePresence>
        {showPaywall && (
          <RateLimitPaywall
            resetsAt={rateLimitInfo.resetsAt}
            onClose={() => setShowPaywall(false)}
          />
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
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 min-w-0"
        style={{ backgroundColor: "#09090E", borderBottom: "1px solid #2E2E40" }}
      >
        <div className="flex flex-1 min-w-0 items-center gap-2 overflow-hidden sm:gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex shrink-0 items-center gap-2 text-sm font-bold transition-colors"
            style={{ color: "#818CF8" }}
          >
            Dystoppia
          </button>
          <span className="shrink-0" style={{ color: "#2E2E40" }}>/</span>
          <span
            className="min-w-0 max-w-[42vw] truncate text-sm sm:max-w-[160px]"
            style={{ color: "#EEEEFF" }}
            title={currentTopic.name}
          >
            {currentTopic.name}
          </span>
          {isPending && (
            <span
              className="hidden text-xs px-2 py-0.5 rounded-full animate-pulse sm:inline-flex"
              style={{ backgroundColor: "rgba(129,140,248,0.15)", color: "#818CF8" }}
            >
              loading...
            </span>
          )}
          {isBossRound && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold animate-pulse" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#EF4444" }}>
              <span className="sm:hidden">⚔️ {bossQuestionsLeft}</span>
              <span className="hidden sm:inline">⚔️ BOSS ({bossQuestionsLeft})</span>
              <InfoButton
                title="Boss Round"
                content="Every 10 answers, 3 maximum-difficulty questions appear with 2× XP. Answer all 3 to earn the Boss Slayer achievement."
                side="below"
              />
            </span>
          )}
        </div>

        {/* Desktop stats bar */}
        <div className="hidden shrink-0 sm:flex items-center gap-4">
          {/* Session XP */}
          {sessionXP > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#FACC15" }}>
              <span>⚡</span><span>{sessionXP} XP</span>
              <InfoButton
                title="Session XP"
                content="XP earned this session. Correct answers give 10 × difficulty, and Boss Round questions give 2× XP."
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
        <div className="flex shrink-0 sm:hidden items-center gap-2">
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
              {sessionXP > 0 && (
                <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#FACC15" }}>
                  <span>⚡</span><span>{sessionXP} XP</span>
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
                      content="Your curriculum organized by chapters and concepts. ⚠ = weak spot (< 50% correct, 3+ attempts). ✓ = mastered (≥ 80%, 10+ attempts). Mute skips a branch, and Solo keeps just one branch active."
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
                onSolo={handleSolo}
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
                content="Your curriculum organized by chapters and concepts. ⚠ = weak spot (< 50% correct, 3+ attempts). ✓ = mastered (≥ 80%, 10+ attempts). Mute skips a branch, and Solo keeps just one branch active."
              />
            </div>
            <p className="text-xs" style={{ color: "#9494B8" }}>⚠ = weak spot &nbsp; ✓ = mastered</p>
          </div>
          <TopicDashboard
            items={currentTopic.items}
            subItemStats={subItemStats}
            onToggleMute={handleToggleMute}
            onSolo={handleSolo}
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
              {/* Fact overlay between questions */}
              {displayingFact ? (
                <FactOverlay
                  key="fact-overlay"
                  fact={displayingFact}
                  ready={!!currentQuestion}
                  onDismiss={() => setDisplayingFact(null)}
                />
              ) : showFlashCard && pendingQuestion?.subItem ? (
                /* Flashcard before new subItem */
                <motion.div key="flashcard" className="w-full max-w-2xl">
                  <FlashCard
                    subItem={pendingQuestion.subItem}
                    topicName={currentTopic.name}
                    onReady={() => setShowFlashCard(false)}
                  />
                </motion.div>
              ) : null}

              {/* Question card */}
              {!displayingFact && !showFlashCard && currentQuestion ? (
                <div key={currentQuestion.id} className="w-full max-w-2xl">
                  <QuestionCard
                    question={currentQuestion}
                    onAnswer={handleAnswer}
                    answerShown={answerShown}
                    lastAnswerCorrect={lastAnswerCorrect}
                    userAnswer={userAnswer}
                    onReportQuestion={handleReportQuestion}
                    reportState={reportState}
                    reportMessage={reportMessage}
                    reportDisabled={isRecordingAnswer}
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
              ) : !displayingFact && !showFlashCard ? (
                <LoadingFactCard
                  error={sessionError || undefined}
                  onRetry={sessionError ? () => void fillQueue() : undefined}
                />
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

