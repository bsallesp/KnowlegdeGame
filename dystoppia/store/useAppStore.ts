"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Topic, Item, Question, SubItemStats, Settings, Achievement, DailyGoal, SessionHistoryEntry } from "@/types";

function generateSessionId(): string {
  return "sess_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, "unlockedAt">[] = [
  { id: "first_answer",    name: "First Step",       description: "Answer your first question",          icon: "🎯" },
  { id: "perfect_10",     name: "Perfect!",          description: "10 correct answers in a row",            icon: "🔥" },
  { id: "streak_7",       name: "Strong Week",       description: "7-day streak",                            icon: "📅" },
  { id: "xp_100",         name: "Centurion",        description: "Accumulate 100 XP",                          icon: "⚡" },
  { id: "xp_1000",        name: "XP Master",         description: "Accumulate 1000 XP",                      icon: "👑" },
  { id: "boss_slayer",    name: "Boss Slayer",        description: "Defeat a Boss Round",                     icon: "🗡️" },
  { id: "speed_demon",    name: "Speed Demon",        description: "Answer correctly in under 10s",          icon: "⚡" },
  { id: "topic_master",   name: "Topic Master",       description: "Score 80%+ on 20 questions from one topic",icon: "🏆" },
  { id: "no_hints",       name: "No Crutches",        description: "Complete 20 questions without hints",      icon: "💪" },
  { id: "daily_goal",     name: "Goal Crushed",        description: "Reach the daily goal",                    icon: "🎖️" },
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

  // XP & streaks
  xp: number;
  streak: number;
  lastActiveDate: string | null;
  sessionXP: number;

  // Lives
  lives: number;
  maxLives: number;

  // Review mode (not persisted)
  reviewMode: boolean;

  // Achievements
  achievements: Achievement[];
  pendingAchievements: string[]; // ids to show as toast

  // Daily goal
  dailyGoal: DailyGoal;

  // Session history
  sessionHistory: SessionHistoryEntry[];

  // Consecutive correct (for perfect_10 achievement)
  consecutiveCorrect: number;
  // Consecutive no-hints (for no_hints achievement)
  consecutiveNoHint: number;

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
  credits: number;
  plan: string;
  setUser: (id: string, email: string) => void;
  clearUser: () => void;
  setCredits: (n: number) => void;
  setPlan: (p: string) => void;

  // Achievement actions
  checkAchievements: (context: { correct?: boolean; timeSpent?: number; usedHint?: boolean; bossCompleted?: boolean }) => void;
  dismissAchievement: (id: string) => void;

  // Daily goal actions
  incrementDailyProgress: () => void;
  setDailyGoalTarget: (target: number) => void;

  // Session history
  saveSessionEntry: (entry: Omit<SessionHistoryEntry, "date">) => void;
}

const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
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
      credits: 50,
      plan: "free",

      // Achievements — initialize all as locked
      achievements: ACHIEVEMENT_DEFINITIONS.map((a) => ({ ...a, unlockedAt: null })),
      pendingAchievements: [],

      // Daily goal
      dailyGoal: {
        target: 20,
        progress: 0,
        date: new Date().toISOString().split("T")[0],
      },

      // Session history
      sessionHistory: [],

      // Streaks
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

      hydrateSubItemStats: (stats) => set({ subItemStats: stats }),

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
          consecutiveCorrect: 0,
          consecutiveNoHint: 0,
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

      addXP: (amount) =>
        set((state) => ({
          xp: state.xp + amount,
          sessionXP: state.sessionXP + amount,
        })),

      checkAndUpdateStreak: () =>
        set((state) => {
          const today = new Date().toISOString().split("T")[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
          if (state.lastActiveDate === today) return {};
          if (state.lastActiveDate === yesterday) return { streak: state.streak + 1, lastActiveDate: today };
          return { streak: 1, lastActiveDate: today };
        }),

      setReviewMode: (val) => set({ reviewMode: val }),
      loseLife: () => set((state) => ({ lives: Math.max(0, state.lives - 1) })),
      resetLives: () => set((state) => ({ lives: state.maxLives })),
      setUser: (id, email) => set({ userId: id, userEmail: email }),
      clearUser: () => set({ userId: null, userEmail: null }),
      setCredits: (n) => set({ credits: n }),
      setPlan: (p) => set({ plan: p }),

      checkAchievements: ({ correct, timeSpent, usedHint, bossCompleted }) =>
        set((state) => {
          const newUnlocked: string[] = [];
          const totalAnswered = Object.values(state.subItemStats).reduce((s, v) => s + v.totalCount, 0);
          const totalCorrect = Object.values(state.subItemStats).reduce((s, v) => s + v.correctCount, 0);

          let newConsecutiveCorrect = state.consecutiveCorrect;
          let newConsecutiveNoHint = state.consecutiveNoHint;

          // usedHint resets the no-hint streak regardless of correct/incorrect
          if (usedHint) newConsecutiveNoHint = 0;

          if (correct !== undefined) {
            newConsecutiveCorrect = correct ? state.consecutiveCorrect + 1 : 0;
            if (!usedHint) {
              newConsecutiveNoHint = correct ? state.consecutiveNoHint + 1 : state.consecutiveNoHint;
            }
          }

          const isUnlocked = (id: string) => state.achievements.find((a) => a.id === id)?.unlockedAt !== null;

          const check = (id: string, condition: boolean) => {
            if (condition && !isUnlocked(id)) newUnlocked.push(id);
          };

          check("first_answer", totalAnswered >= 1);
          check("perfect_10", newConsecutiveCorrect >= 10);
          check("streak_7", state.streak >= 7);
          check("xp_100", state.xp >= 100);
          check("xp_1000", state.xp >= 1000);
          check("speed_demon", !!(correct && timeSpent !== undefined && timeSpent < 10000));
          check("no_hints", newConsecutiveNoHint >= 20);
          check("daily_goal", state.dailyGoal.progress + 1 >= state.dailyGoal.target);
          check("boss_slayer", !!bossCompleted);

          // topic_master: 80%+ in 20 questions of any subItem
          const topicMaster = Object.values(state.subItemStats).some(
            (s) => s.totalCount >= 20 && s.correctCount / s.totalCount >= 0.8
          );
          check("topic_master", topicMaster);

          if (newUnlocked.length === 0 && newConsecutiveCorrect === state.consecutiveCorrect && newConsecutiveNoHint === state.consecutiveNoHint) {
            return {};
          }

          const now = new Date().toISOString();
          return {
            consecutiveCorrect: newConsecutiveCorrect,
            consecutiveNoHint: newConsecutiveNoHint,
            achievements: state.achievements.map((a) =>
              newUnlocked.includes(a.id) ? { ...a, unlockedAt: now } : a
            ),
            pendingAchievements: [...state.pendingAchievements, ...newUnlocked],
          };
        }),

      dismissAchievement: (id) =>
        set((state) => ({
          pendingAchievements: state.pendingAchievements.filter((a) => a !== id),
        })),

      incrementDailyProgress: () =>
        set((state) => {
          const today = new Date().toISOString().split("T")[0];
          const goal = state.dailyGoal.date === today
            ? state.dailyGoal
            : { target: state.dailyGoal.target, progress: 0, date: today };
          return { dailyGoal: { ...goal, progress: goal.progress + 1 } };
        }),

      setDailyGoalTarget: (target) =>
        set((state) => ({ dailyGoal: { ...state.dailyGoal, target } })),

      saveSessionEntry: (entry) =>
        set((state) => {
          const today = new Date().toISOString().split("T")[0];
          const existing = state.sessionHistory.find((e) => e.date === today && e.topicId === entry.topicId);
          if (existing) {
            return {
              sessionHistory: state.sessionHistory.map((e) =>
                e.date === today && e.topicId === entry.topicId
                  ? {
                      ...e,
                      correctCount: e.correctCount + entry.correctCount,
                      totalCount: e.totalCount + entry.totalCount,
                      xpEarned: e.xpEarned + entry.xpEarned,
                    }
                  : e
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
        if (state) state._hasHydrated = true;
      },
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
        credits: state.credits,
        plan: state.plan,
        achievements: state.achievements,
        dailyGoal: state.dailyGoal,
        sessionHistory: state.sessionHistory,
        consecutiveCorrect: state.consecutiveCorrect,
        consecutiveNoHint: state.consecutiveNoHint,
      }),
    }
  )
);

export default useAppStore;

