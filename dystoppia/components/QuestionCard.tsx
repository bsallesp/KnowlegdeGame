"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Question } from "@/types";

interface QuestionCardProps {
  question: Question;
  onAnswer: (answer: string, timeSpent: number) => void;
  answerShown: boolean;
  lastAnswerCorrect: boolean | null;
  userAnswer?: string;
  onHintUsed?: () => void;
  xp?: number;
  topicName?: string;
}

function AnswerFeedback({ correct }: { correct: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
      style={{
        backgroundColor: correct ? "rgba(96, 165, 250, 0.1)" : "rgba(249, 115, 22, 0.1)",
        border: `1px solid ${correct ? "#60A5FA" : "#F97316"}`,
        color: correct ? "#60A5FA" : "#F97316",
      }}
    >
      {correct ? (
        <>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Correct!
        </>
      ) : (
        <>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Incorrect
        </>
      )}
    </motion.div>
  );
}

export default function QuestionCard({
  question,
  onAnswer,
  answerShown,
  lastAnswerCorrect,
  userAnswer,
  onHintUsed,
  xp = 0,
  topicName = "",
}: QuestionCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [hintError, setHintError] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const HINT_COST = 5;

  useEffect(() => {
    setSelectedAnswer("");
    setHint(null);
    setHintUsed(false);
    setHintError(false);
    startTimeRef.current = Date.now();

    if (question.timeLimit && question.timeLimit > 0) {
      setTimeLeft(question.timeLimit);
    } else {
      setTimeLeft(null);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [question.id, question.timeLimit]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || answerShown) return;

    if (timeLeft <= 0) {
      const timeSpent = Date.now() - startTimeRef.current;
      onAnswer("__timeout__", timeSpent);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, answerShown, onAnswer]);

  const handleSubmit = () => {
    if (!selectedAnswer) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const timeSpent = Date.now() - startTimeRef.current;
    onAnswer(selectedAnswer, timeSpent);
  };

  const handleHint = async () => {
    if (hintUsed || hintLoading || xp < HINT_COST) return;
    setHintLoading(true);
    setHintError(false);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionContent: question.content,
          options: question.options,
          answer: question.answer,
          subItemName: question.subItem?.name ?? "",
          topicName,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setHint(data.hint);
        setHintUsed(true);
        onHintUsed?.();
      } else {
        setHintError(true);
      }
    } catch {
      setHintError(true);
    } finally {
      setHintLoading(false);
    }
  };

  const options = question.options || [];

  const getOptionStyle = (option: string) => {
    if (!answerShown) {
      const isSelected = selectedAnswer === option;
      return {
        backgroundColor: isSelected ? "rgba(129, 140, 248, 0.15)" : "#1C1C28",
        border: `1px solid ${isSelected ? "#818CF8" : "#2E2E40"}`,
        color: "#EEEEFF",
        cursor: "pointer",
      };
    }
    const isCorrect = option === question.answer;
    const isUserAnswer = option === userAnswer;
    if (isCorrect) return { backgroundColor: "rgba(96, 165, 250, 0.15)", border: "1px solid #60A5FA", color: "#60A5FA", cursor: "default" };
    if (isUserAnswer && !isCorrect) return { backgroundColor: "rgba(249, 115, 22, 0.1)", border: "1px solid #F97316", color: "#F97316", cursor: "default" };
    return { backgroundColor: "#12121A", border: "1px solid #1C1C28", color: "#9494B8", cursor: "default" };
  };

  const typeLabel: Record<string, string> = {
    multiple_choice: "Multiple Choice",
    single_choice: "Single Choice",
    fill_blank: "Fill in the Blank",
    true_false: "True or False",
  };

  const difficultyColor = ["", "#60A5FA", "#38BDF8", "#818CF8", "#F97316", "#EF4444"][question.difficulty] || "#818CF8";

  const timerPct = question.timeLimit && timeLeft !== null ? (timeLeft / question.timeLimit) * 100 : null;
  const timerColor = timerPct !== null ? (timerPct > 50 ? "#60A5FA" : timerPct > 20 ? "#FACC15" : "#F97316") : "#60A5FA";

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${s}s`;
  };

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Question header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: "#1C1C28", color: "#9494B8" }}>
          {typeLabel[question.type] || question.type}
        </span>
        {question.subItem && (
          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "#1C1C28", color: "#818CF8" }}>
            {question.subItem.name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Hint button */}
          {!answerShown && question.type !== "fill_blank" && (
            <button
              onClick={handleHint}
              disabled={hintUsed || hintLoading || xp < HINT_COST}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
              style={{
                backgroundColor: hintUsed ? "#1C1C28" : "rgba(250,204,21,0.1)",
                border: `1px solid ${hintUsed ? "#2E2E40" : "rgba(250,204,21,0.3)"}`,
                color: hintUsed ? "#9494B8" : xp < HINT_COST ? "#9494B8" : "#FACC15",
                cursor: hintUsed || xp < HINT_COST ? "not-allowed" : "pointer",
              }}
              title={xp < HINT_COST ? `Precisa de ${HINT_COST} XP para usar hint` : `Hint (-${HINT_COST} XP)`}
            >
              {hintLoading ? "..." : hintError ? "⚠ Erro" : hintUsed ? "✓ Hint" : `💡 -${HINT_COST} XP`}
            </button>
          )}

          <div className="flex items-center gap-1">
            <span className="text-xs" style={{ color: "#9494B8" }}>Difficulty</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((d) => (
                <div key={d} className="w-2 h-2 rounded-full" style={{ backgroundColor: d <= question.difficulty ? difficultyColor : "#2E2E40" }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timer bar */}
      {timerPct !== null && !answerShown && (
        <div className="mb-3 relative">
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "#2E2E40" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: timerColor, width: `${timerPct}%` }}
              transition={{ duration: 0.9, ease: "linear" }}
            />
          </div>
          <span className="absolute right-0 -top-4 text-xs font-mono font-semibold" style={{ color: timerColor }}>
            {timeLeft !== null ? formatTime(timeLeft) : ""}
          </span>
        </div>
      )}

      {/* Hint display */}
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-3 px-4 py-2 rounded-lg text-sm"
            style={{ backgroundColor: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.25)", color: "#FACC15" }}
          >
            💡 {hint}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question content */}
      <div className="rounded-xl p-6 mb-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
        <p className="text-lg font-medium leading-relaxed" style={{ color: "#EEEEFF" }}>
          {question.type === "fill_blank"
            ? question.content.split("___").map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span
                      className="inline-block mx-1 px-3 py-0.5 rounded border-b-2 font-bold"
                      style={{
                        backgroundColor: "rgba(129, 140, 248, 0.1)",
                        borderColor: "#818CF8",
                        color: answerShown ? (lastAnswerCorrect ? "#60A5FA" : "#F97316") : "#818CF8",
                        minWidth: "80px",
                        textAlign: "center",
                      }}
                    >
                      {answerShown ? (lastAnswerCorrect ? selectedAnswer || userAnswer : question.answer) : (selectedAnswer || "___")}
                    </span>
                  )}
                </span>
              ))
            : question.content}
        </p>
      </div>

      {/* Answer options */}
      <div className="space-y-2 mb-4">
        {question.type === "fill_blank" ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {(question.options || []).map((option, i) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === question.answer;
              const isUserWrong = answerShown && option === userAnswer && !isCorrect;
              return (
                <motion.button
                  key={i}
                  onClick={() => { if (!answerShown) setSelectedAnswer(option); }}
                  whileHover={!answerShown ? { scale: 1.04 } : {}}
                  whileTap={!answerShown ? { scale: 0.96 } : {}}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={{
                    backgroundColor: answerShown ? (isCorrect ? "rgba(96,165,250,0.15)" : isUserWrong ? "rgba(249,115,22,0.1)" : "#1C1C28") : isSelected ? "rgba(129,140,248,0.2)" : "#1C1C28",
                    border: `1px solid ${answerShown ? (isCorrect ? "#60A5FA" : isUserWrong ? "#F97316" : "#2E2E40") : isSelected ? "#818CF8" : "#2E2E40"}`,
                    color: answerShown ? (isCorrect ? "#60A5FA" : isUserWrong ? "#F97316" : "#9494B8") : isSelected ? "#818CF8" : "#9494B8",
                    cursor: answerShown ? "default" : "pointer",
                  }}
                >
                  {option}
                </motion.button>
              );
            })}
          </div>
        ) : (
          options.map((option, i) => {
            const style = getOptionStyle(option);
            const isSelected = selectedAnswer === option;
            const isCorrectOption = option === question.answer;
            return (
              <motion.button
                key={i}
                onClick={() => { if (!answerShown) setSelectedAnswer(option); }}
                whileHover={!answerShown ? { scale: 1.01 } : {}}
                whileTap={!answerShown ? { scale: 0.99 } : {}}
                className="w-full text-left px-4 py-3 rounded-lg text-sm transition-all flex items-center gap-3"
                style={style}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    backgroundColor: answerShown ? (isCorrectOption ? "#60A5FA" : option === userAnswer ? "#F97316" : "#2E2E40") : isSelected ? "#818CF8" : "#2E2E40",
                    color: answerShown ? (isCorrectOption || option === userAnswer ? "white" : "#9494B8") : isSelected ? "white" : "#9494B8",
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{option}</span>
                {answerShown && isCorrectOption && (
                  <svg className="w-4 h-4 ml-auto flex-shrink-0" style={{ color: "#60A5FA" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </motion.button>
            );
          })
        )}
      </div>

      {/* Submit button */}
      {!answerShown && selectedAnswer && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSubmit}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-all"
          style={{ backgroundColor: "#818CF8", color: "white" }}
        >
          Submit Answer
        </motion.button>
      )}

      {/* Feedback */}
      <AnimatePresence>
        {answerShown && lastAnswerCorrect !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <AnswerFeedback correct={lastAnswerCorrect} />
            <div
              className="p-4 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}
            >
              <span className="font-semibold" style={{ color: "#EEEEFF" }}>Explanation: </span>
              {question.explanation}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
