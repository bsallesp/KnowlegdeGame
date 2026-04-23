"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Topic, Item, Question, SubItemStats, Settings, Achievement, SessionHistoryEntry } from "@/types";
import { applyItemSolo, applySubItemSolo } from "@/lib/topicFocus";

function generateSessionId(): string {
  return "sess_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, "unlockedAt">[] = [
  { id: "first_answer", name: "First Step", description: "Answer your first question", icon: "🎯" },
  { id: "perfect_10", name: "Perfect!", description: "10 correct answers in a row", icon: "🔥" },
  { id: "xp_100", name: "Centurion", description: "Accumulate 100 XP", icon: "⚡" },
  { id: "xp_1000", name: "XP Master", description: "Accumulate 1000 XP", icon: "👑" },
  { id: "boss_slayer", name: "Boss Slayer", description: "Defeat a Boss Round", icon: "🗡️" },
  { id: "speed_demon", name: "Speed Demon", description: "Answer correctly in under 10s", icon: "⚡" },
  { id: "topic_master", name: "Topic Master", description: "Score 80%+ on 20 questions from one topic", icon: "🏆" },
  { id: "no_hints", name: "No Crutches", description: "Complete 20 questions without hints", icon: "💪" },
];

interface AppState {
  _hasHydrated: boolean;
  sessionId: string;
  currentTopic: Topic | null;
  questionQueue: Question[];
  currentQuestion: Question | null;
  subItemStats: Record<string, SubItemStats>;
  settings: Settings;
  isGenerating: boolean;
  answerShown: boolean;
  lastAnswerCorrect: boolean | null;
  xp: number;
  sessionXP: number;
  reviewMode: boolean;
  achievements: Achievement[];
  pendingAchievements: string[];
  sessionHistory: SessionHistoryEntry[];
  consecutiveCorrect: number;
  consecutiveNoHint: number;
  userId: string | null;
  userEmail: string | null;
  userRole: string;
  userStatus: string;
  isInternalUser: boolean;
  plan: string;
  subscriptionStatus: string;
  hourlyUsage: number;
  hourlyRemaining: number;
  hourlyResetsAt: string | null;
  setCurrentTopic: (topic: Topic) => void;
  addItemToCurrentTopic: (item: Item) => void;
  setQuestionQueue: (questions: Question[]) => void;
  addToQueue: (questions: Question[]) => void;
  prependToQueue: (questions: Question[]) => void;
  setCurrentQuestion: (question: Question | null) => void;
  advanceQueue: () => void;
  updateSubItemStats: (subItemId: string, correct: boolean, difficulty: number) => void;
  setSubItemStatsEntry: (subItemId: string, stats: SubItemStats) => void;
  hydrateSubItemStats: (stats: Record<string, SubItemStats>) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setIsGenerating: (val: boolean) => void;
  setAnswerShown: (val: boolean) => void;
  setLastAnswerCorrect: (val: boolean | null) => void;
  resetSession: () => void;
  toggleItemMute: (itemId: string) => void;
  toggleSubItemMute: (subItemId: string) => void;
  soloItem: (itemId: string) => void;
  soloSubItem: (subItemId: string) => void;
  addXP: (amount: number) => void;
  setReviewMode: (val: boolean) => void;
  setUser: (id: string, email: string, role?: string, status?: string, isInternal?: boolean) => void;
  clearUser: () => void;
  setRateLimitState: (state: {
    hourlyUsage: number;
    hourlyRemaining: number;
    hourlyResetsAt: string | null;
  }) => void;
  setPlan: (p: string) => void;
  setSubscriptionStatus: (s: string) => void;
  checkAchievements: (context: { correct?: boolean; timeSpent?: number; usedHint?: boolean; bossCompleted?: boolean }) => void;
  dismissAchievement: (id: string) => void;
  saveSessionEntry: (entry: Omit<SessionHistoryEntry, "date">) => void;
}

const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      sessionId: generateSessionId(),
      currentTopic: null,
      questionQueue: [],
      currentQuestion: null,
      subItemStats: {},
      settings: {
        queueDepth: 5,
        refillTrigger: 3,
        timerEnabled: true,
      },
      isGenerating: false,
      answerShown: false,
      lastAnswerCorrect: null,
      xp: 0,
      sessionXP: 0,
      reviewMode: false,
      userId: null,
      userEmail: null,
      userRole: "customer",
      userStatus: "active",
      isInternalUser: false,
      plan: "free",
      subscriptionStatus: "inactive",
      hourlyUsage: 0,
      hourlyRemaining: 5,
      hourlyResetsAt: null,
      achievements: ACHIEVEMENT_DEFINITIONS.map((a) => ({ ...a, unlockedAt: null })),
      pendingAchievements: [],
      sessionHistory: [],
      consecutiveCorrect: 0,
      consecutiveNoHint: 0,

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

      prependToQueue: (questions) =>
        set((state) => {
          const existingIds = new Set([
            ...state.questionQueue.map((q) => q.id),
            ...(state.currentQuestion ? [state.currentQuestion.id] : []),
          ]);
          const unique = questions.filter((q) => !existingIds.has(q.id));
          return { questionQueue: [...unique, ...state.questionQueue] };
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

      setSubItemStatsEntry: (subItemId, stats) =>
        set((state) => ({
          subItemStats: {
            ...state.subItemStats,
            [subItemId]: stats,
          },
          currentTopic: state.currentTopic
            ? {
                ...state.currentTopic,
                items: state.currentTopic.items.map((item) => ({
                  ...item,
                  subItems: item.subItems.map((sub) =>
                    sub.id === subItemId ? { ...sub, difficulty: stats.difficulty } : sub
                  ),
                })),
              }
            : null,
        })),

      hydrateSubItemStats: (stats) => set({ subItemStats: stats }),

      setSettings: (settings) =>
        set((state) => ({ settings: { ...state.settings, ...settings } })),

      setIsGenerating: (val) => set({ isGenerating: val }),
      setAnswerShown: (val) => set({ answerShown: val }),
      setLastAnswerCorrect: (val) => set({ lastAnswerCorrect: val }),

      resetSession: () =>
        set({
          currentTopic: null,
          questionQueue: [],
          currentQuestion: null,
          subItemStats: {},
          isGenerating: false,
          answerShown: false,
          lastAnswerCorrect: null,
          sessionXP: 0,
          consecutiveCorrect: 0,
          consecutiveNoHint: 0,
        }),

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

      soloItem: (itemId) =>
        set((state) => {
          if (!state.currentTopic) return {};

          return {
            currentTopic: {
              ...state.currentTopic,
              items: applyItemSolo(state.currentTopic.items, itemId),
            },
          };
        }),

      soloSubItem: (subItemId) =>
        set((state) => {
          if (!state.currentTopic) return {};

          return {
            currentTopic: {
              ...state.currentTopic,
              items: applySubItemSolo(state.currentTopic.items, subItemId),
            },
          };
        }),

      addXP: (amount) =>
        set((state) => ({
          xp: state.xp + amount,
          sessionXP: state.sessionXP + amount,
        })),

      setReviewMode: (val) => set({ reviewMode: val }),

      setUser: (id, email, role = "customer", status = "active", isInternal = false) =>
        set({
          userId: id,
          userEmail: email,
          userRole: role,
          userStatus: status,
          isInternalUser: isInternal,
        }),

      clearUser: () =>
        set({
          userId: null,
          userEmail: null,
          userRole: "customer",
          userStatus: "active",
          isInternalUser: false,
        }),

      setRateLimitState: (state) =>
        set({
          hourlyUsage: state.hourlyUsage,
          hourlyRemaining: state.hourlyRemaining,
          hourlyResetsAt: state.hourlyResetsAt,
        }),

      setPlan: (p) => set({ plan: p }),
      setSubscriptionStatus: (s) => set({ subscriptionStatus: s }),

      checkAchievements: ({ correct, timeSpent, usedHint, bossCompleted }) =>
        set((state) => {
          const newUnlocked: string[] = [];
          const totalAnswered = Object.values(state.subItemStats).reduce((sum, value) => sum + value.totalCount, 0);

          let newConsecutiveCorrect = state.consecutiveCorrect;
          let newConsecutiveNoHint = state.consecutiveNoHint;

          if (usedHint) {
            newConsecutiveNoHint = 0;
          }

          if (correct !== undefined) {
            newConsecutiveCorrect = correct ? state.consecutiveCorrect + 1 : 0;
            if (!usedHint) {
              newConsecutiveNoHint = correct ? state.consecutiveNoHint + 1 : state.consecutiveNoHint;
            }
          }

          const isUnlocked = (id: string) => state.achievements.find((achievement) => achievement.id === id)?.unlockedAt !== null;

          const check = (id: string, condition: boolean) => {
            if (condition && !isUnlocked(id)) {
              newUnlocked.push(id);
            }
          };

          check("first_answer", totalAnswered >= 1);
          check("perfect_10", newConsecutiveCorrect >= 10);
          check("xp_100", state.xp >= 100);
          check("xp_1000", state.xp >= 1000);
          check("speed_demon", !!(correct && timeSpent !== undefined && timeSpent < 10000));
          check("no_hints", newConsecutiveNoHint >= 20);
          check("boss_slayer", !!bossCompleted);

          const topicMaster = Object.values(state.subItemStats).some(
            (stats) => stats.totalCount >= 20 && stats.correctCount / stats.totalCount >= 0.8
          );
          check("topic_master", topicMaster);

          if (
            newUnlocked.length === 0 &&
            newConsecutiveCorrect === state.consecutiveCorrect &&
            newConsecutiveNoHint === state.consecutiveNoHint
          ) {
            return {};
          }

          const now = new Date().toISOString();

          return {
            consecutiveCorrect: newConsecutiveCorrect,
            consecutiveNoHint: newConsecutiveNoHint,
            achievements: state.achievements.map((achievement) =>
              newUnlocked.includes(achievement.id) ? { ...achievement, unlockedAt: now } : achievement
            ),
            pendingAchievements: [...state.pendingAchievements, ...newUnlocked],
          };
        }),

      dismissAchievement: (id) =>
        set((state) => ({
          pendingAchievements: state.pendingAchievements.filter((achievementId) => achievementId !== id),
        })),

      saveSessionEntry: (entry) =>
        set((state) => {
          const today = new Date().toISOString().split("T")[0];
          const existing = state.sessionHistory.find((historyEntry) => historyEntry.date === today && historyEntry.topicId === entry.topicId);

          if (existing) {
            return {
              sessionHistory: state.sessionHistory.map((historyEntry) =>
                historyEntry.date === today && historyEntry.topicId === entry.topicId
                  ? {
                      ...historyEntry,
                      correctCount: historyEntry.correctCount + entry.correctCount,
                      totalCount: historyEntry.totalCount + entry.totalCount,
                      xpEarned: historyEntry.xpEarned + entry.xpEarned,
                    }
                  : historyEntry
              ),
            };
          }

          return {
            sessionHistory: [...state.sessionHistory.slice(-89), { ...entry, date: today }],
          };
        }),
    }),
    {
      name: "dystoppia-store",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
        }
      },
      partialize: (state) => ({
        sessionId: state.sessionId,
        settings: state.settings,
        subItemStats: state.subItemStats,
        currentTopic: state.currentTopic,
        xp: state.xp,
        userId: state.userId,
        userEmail: state.userEmail,
        userRole: state.userRole,
        userStatus: state.userStatus,
        isInternalUser: state.isInternalUser,
        plan: state.plan,
        subscriptionStatus: state.subscriptionStatus,
        hourlyUsage: state.hourlyUsage,
        hourlyRemaining: state.hourlyRemaining,
        hourlyResetsAt: state.hourlyResetsAt,
        achievements: state.achievements,
        sessionHistory: state.sessionHistory,
        consecutiveCorrect: state.consecutiveCorrect,
        consecutiveNoHint: state.consecutiveNoHint,
      }),
    }
  )
);

export default useAppStore;
