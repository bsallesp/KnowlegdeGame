"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Topic, Item, Question, SubItemStats, Settings } from "@/types";

function generateSessionId(): string {
  return "sess_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

interface AppState {
  sessionId: string;
  currentTopic: Topic | null;
  questionQueue: Question[];
  currentQuestion: Question | null;
  subItemStats: Record<string, SubItemStats>;
  settings: Settings;
  isGenerating: boolean;
  answerShown: boolean;
  lastAnswerCorrect: boolean | null;

  // XP & streaks (xp, streak, lastActiveDate persisted; sessionXP not persisted)
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  sessionXP: number;

  // Lives
  lives: number;
  maxLives: number;

  // Review mode (not persisted)
  reviewMode: boolean;

  // Actions
  setCurrentTopic: (topic: Topic) => void;
  addItemToCurrentTopic: (item: Item) => void;
  setQuestionQueue: (questions: Question[]) => void;
  addToQueue: (questions: Question[]) => void;
  setCurrentQuestion: (question: Question | null) => void;
  advanceQueue: () => void;
  updateSubItemStats: (subItemId: string, correct: boolean, difficulty: number) => void;
  hydrateSubItemStats: (stats: Record<string, SubItemStats>) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setIsGenerating: (val: boolean) => void;
  setAnswerShown: (val: boolean) => void;
  setLastAnswerCorrect: (val: boolean | null) => void;
  resetSession: () => void;
  toggleItemMute: (itemId: string) => void;
  toggleSubItemMute: (subItemId: string) => void;

  // XP & streak actions
  addXP: (amount: number) => void;
  checkAndUpdateStreak: () => void;
  setReviewMode: (val: boolean) => void;

  // Lives actions
  loseLife: () => void;
  resetLives: () => void;

  // User identity
  userId: string | null;
  userEmail: string | null;
  setUser: (id: string, email: string) => void;
  clearUser: () => void;
}

const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessionId: generateSessionId(),
      currentTopic: null,
      questionQueue: [],
      currentQuestion: null,
      subItemStats: {},
      settings: {
        queueDepth: 5,
        refillTrigger: 3,
      },
      isGenerating: false,
      answerShown: false,
      lastAnswerCorrect: null,

      // XP & streaks
      xp: 0,
      streak: 0,
      lastActiveDate: null,
      sessionXP: 0,
      reviewMode: false,

      // Lives
      lives: 3,
      maxLives: 3,

      // User identity
      userId: null,
      userEmail: null,

      setCurrentTopic: (topic) => set({ currentTopic: topic }),

      addItemToCurrentTopic: (item) =>
        set((state) => ({
          currentTopic: state.currentTopic
            ? { ...state.currentTopic, items: [...state.currentTopic.items, item] }
            : null,
        })),

      setQuestionQueue: (questions) => set({ questionQueue: questions }),

      addToQueue: (questions) =>
        set((state) => {
          const existingIds = new Set([
            ...state.questionQueue.map((q) => q.id),
            ...(state.currentQuestion ? [state.currentQuestion.id] : []),
          ]);
          const unique = questions.filter((q) => !existingIds.has(q.id));
          return { questionQueue: [...state.questionQueue, ...unique] };
        }),

      setCurrentQuestion: (question) => set({ currentQuestion: question, answerShown: false, lastAnswerCorrect: null }),

      advanceQueue: () =>
        set((state) => {
          const [next, ...rest] = state.questionQueue;
          return {
            questionQueue: rest,
            currentQuestion: next || null,
            answerShown: false,
            lastAnswerCorrect: null,
          };
        }),

      updateSubItemStats: (subItemId, correct, difficulty) =>
        set((state) => {
          const existing = state.subItemStats[subItemId] || {
            correctCount: 0,
            totalCount: 0,
            difficulty: 1,
          };
          return {
            subItemStats: {
              ...state.subItemStats,
              [subItemId]: {
                correctCount: existing.correctCount + (correct ? 1 : 0),
                totalCount: existing.totalCount + 1,
                difficulty,
                lastSeen: new Date().toISOString(),
              },
            },
            currentTopic: state.currentTopic
              ? {
                  ...state.currentTopic,
                  items: state.currentTopic.items.map((item) => ({
                    ...item,
                    subItems: item.subItems.map((sub) =>
                      sub.id === subItemId ? { ...sub, difficulty } : sub
                    ),
                  })),
                }
              : null,
          };
        }),

      hydrateSubItemStats: (stats) =>
        set({ subItemStats: stats }),

      setSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),

      setIsGenerating: (val) => set({ isGenerating: val }),

      setAnswerShown: (val) => set({ answerShown: val }),

      setLastAnswerCorrect: (val) => set({ lastAnswerCorrect: val }),

      resetSession: () =>
        set((state) => ({
          currentTopic: null,
          questionQueue: [],
          currentQuestion: null,
          subItemStats: {},
          isGenerating: false,
          answerShown: false,
          lastAnswerCorrect: null,
          sessionXP: 0,
          lives: state.maxLives,
        })),

      toggleItemMute: (itemId) =>
        set((state) => {
          if (!state.currentTopic) return {};
          return {
            currentTopic: {
              ...state.currentTopic,
              items: state.currentTopic.items.map((item) =>
                item.id === itemId ? { ...item, muted: !item.muted } : item
              ),
            },
          };
        }),

      toggleSubItemMute: (subItemId) =>
        set((state) => {
          if (!state.currentTopic) return {};
          return {
            currentTopic: {
              ...state.currentTopic,
              items: state.currentTopic.items.map((item) => ({
                ...item,
                subItems: item.subItems.map((sub) =>
                  sub.id === subItemId ? { ...sub, muted: !sub.muted } : sub
                ),
              })),
            },
          };
        }),

      // XP formula: Math.round(10 * difficulty * Math.min(2, 1 + streak * 0.05))
      addXP: (amount) =>
        set((state) => ({
          xp: state.xp + amount,
          sessionXP: state.sessionXP + amount,
        })),

      checkAndUpdateStreak: () =>
        set((state) => {
          const today = new Date().toISOString().split("T")[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

          if (state.lastActiveDate === today) {
            return {};
          } else if (state.lastActiveDate === yesterday) {
            return { streak: state.streak + 1, lastActiveDate: today };
          } else {
            return { streak: 1, lastActiveDate: today };
          }
        }),

      setReviewMode: (val) => set({ reviewMode: val }),

      loseLife: () =>
        set((state) => ({ lives: Math.max(0, state.lives - 1) })),

      resetLives: () =>
        set((state) => ({ lives: state.maxLives })),

      setUser: (id, email) => set({ userId: id, userEmail: email }),

      clearUser: () => set({ userId: null, userEmail: null }),
    }),
    {
      name: "dystoppia-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        settings: state.settings,
        subItemStats: state.subItemStats,
        currentTopic: state.currentTopic,
        xp: state.xp,
        streak: state.streak,
        lastActiveDate: state.lastActiveDate,
        lives: state.lives,
        maxLives: state.maxLives,
        userId: state.userId,
        userEmail: state.userEmail,
      }),
    }
  )
);

export default useAppStore;
