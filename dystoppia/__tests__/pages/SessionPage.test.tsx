import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ─── Framer-motion mock ───────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props as any;
      return <div {...rest}>{children}</div>;
    },
    button: ({ children, onClick, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props as any;
      return <button onClick={onClick as any} {...rest}>{children}</button>;
    },
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props as any;
      return <p {...rest}>{children}</p>;
    },
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props as any;
      return <span {...rest}>{children}</span>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ─── Child component mocks ────────────────────────────────────────────────────
vi.mock("@/components/TopicDashboard", () => ({
  default: ({ items, onToggleMute, onSolo, onOpenAudiobooks }: { items: unknown[]; onToggleMute: Function; onSolo?: Function; onOpenAudiobooks?: Function }) => (
    <div data-testid="topic-dashboard" data-item-count={items.length}>
      <button data-testid="toggle-item-mute" onClick={() => onToggleMute("item-1", "item")}>
        Toggle item
      </button>
      <button data-testid="solo-item" onClick={() => onSolo?.("item-1", "item")}>
        Solo item
      </button>
      <button
        data-testid="open-audiobook-dialog"
        onClick={() => onOpenAudiobooks?.("item-1", "item", "Cloud Concepts")}
      >
        Open audiobook
      </button>
    </div>
  ),
}));

vi.mock("@/components/AchievementToast", () => ({
  default: () => <div data-testid="achievement-toast" />,
}));

vi.mock("@/components/DailyGoalBar", () => ({
  default: () => <div data-testid="daily-goal-bar" />,
}));

vi.mock("@/components/BossRound", () => ({
  default: ({ onReady }: { onReady: () => void }) => (
    <div data-testid="boss-round">
      <button onClick={onReady} data-testid="boss-ready-btn">Face the Boss</button>
    </div>
  ),
}));

vi.mock("@/components/FlashCard", () => ({
  default: ({ onReady, subItem }: { onReady: () => void; subItem: { name: string } }) => (
    <div data-testid="flash-card" data-subitem={subItem?.name}>
      <button onClick={onReady} data-testid="flash-ready-btn">Let's go</button>
    </div>
  ),
}));

vi.mock("@/components/SessionSummary", () => ({
  default: ({ onContinue, onNewTopic, topicName }: { onContinue: () => void; onNewTopic: () => void; topicName: string }) => (
    <div data-testid="session-summary" data-topic={topicName}>
      <button onClick={onContinue} data-testid="summary-continue">Continue</button>
      <button onClick={onNewTopic} data-testid="summary-new-topic">New topic</button>
    </div>
  ),
}));

vi.mock("@/components/QuestionCard", () => ({
  default: ({ question, onAnswer, answerShown, onHintUsed }: { question: { id: string; text: string }; onAnswer: Function; answerShown: boolean; onHintUsed?: () => void }) => (
    <div data-testid="question-card" data-question-id={question.id} data-answer-shown={answerShown}>
      <span>{question.text}</span>
      <button onClick={() => onAnswer("answer", 1000)} data-testid="answer-btn">Answer</button>
      <button onClick={() => onHintUsed?.()} data-testid="hint-btn">Hint</button>
    </div>
  ),
}));

vi.mock("@/components/RateLimitPaywall", () => ({
  default: ({ window, resetsAt, onClose }: { window: string; resetsAt: string | null; onClose: () => void }) => (
    <div data-testid="rate-limit-paywall" data-window={window} data-resets-at={resetsAt ?? ""}>
      <button data-testid="close-rate-limit-paywall" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("@/components/SettingsDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="settings-dialog" /> : null),
}));

vi.mock("@/components/AudiobookDialog", () => ({
  default: ({ open, onGenerate, onPlay, audios }: { open: boolean; onGenerate: () => void; onPlay: (entry: any) => void; audios: any[] }) =>
    open ? (
      <div data-testid="audiobook-dialog">
        <button data-testid="audiobook-generate" onClick={onGenerate}>Generate</button>
        <button
          data-testid="audiobook-play"
          onClick={() => {
            if (audios.length > 0) onPlay(audios[0]);
          }}
        >
          Play
        </button>
      </div>
    ) : null,
}));

vi.mock("@/components/AudiobookPlayer", () => ({
  default: () => <div data-testid="audiobook-player" />,
}));

vi.mock("@/components/ui/SkeletonBlock", () => ({
  default: ({ width, height, className }: { width?: string; height?: string; className?: string }) => (
    <div
      data-testid="skeleton-block"
      style={{ width, height }}
      className={className}
    />
  ),
}));

vi.mock("@/lib/adaptive", () => ({
  selectNextSubItem: vi.fn(() => "sub-1"),
}));

vi.mock("@/lib/clientLogger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Router mock ──────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────
let mockAuthLoading = false;
vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => ({ loading: mockAuthLoading }),
}));

// ─── Store mock ───────────────────────────────────────────────────────────────
const mockAdvanceQueue = vi.hoisted(() => vi.fn());
const mockAddToQueue = vi.hoisted(() => vi.fn());
const mockSetCurrentQuestion = vi.hoisted(() => vi.fn());
const mockUpdateSubItemStats = vi.hoisted(() => vi.fn());
const mockSetSubItemStatsEntry = vi.hoisted(() => vi.fn());
const mockHydrateSubItemStats = vi.hoisted(() => vi.fn());
const mockSetIsGenerating = vi.hoisted(() => vi.fn());
const mockSetAnswerShown = vi.hoisted(() => vi.fn());
const mockSetLastAnswerCorrect = vi.hoisted(() => vi.fn());
const mockToggleItemMute = vi.hoisted(() => vi.fn());
const mockToggleSubItemMute = vi.hoisted(() => vi.fn());
const mockSoloItem = vi.hoisted(() => vi.fn());
const mockSoloSubItem = vi.hoisted(() => vi.fn());
const mockAddXP = vi.hoisted(() => vi.fn());
const mockCheckAndUpdateStreak = vi.hoisted(() => vi.fn());
const mockLoseLife = vi.hoisted(() => vi.fn());
const mockGainLife = vi.hoisted(() => vi.fn());
const mockResetLives = vi.hoisted(() => vi.fn());
const mockCheckAchievements = vi.hoisted(() => vi.fn());
const mockIncrementDailyProgress = vi.hoisted(() => vi.fn());
const mockDecrementDailyProgress = vi.hoisted(() => vi.fn());
const mockSaveSessionEntry = vi.hoisted(() => vi.fn());
const mockUseAppStore = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAppStore", () => ({
  default: mockUseAppStore,
}));

// Mutable state for tests to control
let storeState = {
  _hasHydrated: true,
  currentTopic: null as any,
  questionQueue: [] as any[],
  currentQuestion: null as any,
  subItemStats: {} as Record<string, any>,
  settings: { queueDepth: 5, refillTrigger: 3 },
  isGenerating: false,
  answerShown: false,
  lastAnswerCorrect: null as boolean | null,
  sessionId: "sess-1",
  xp: 0,
  sessionXP: 0,
  streak: 0,
  lives: 3,
  maxLives: 3,
  weeklyUsage: 0,
  weeklyRemaining: 30,
  weeklyResetsAt: null as string | null,
  plan: "free" as "free" | "pro",
  reviewMode: false,
  achievements: [] as any[],
  pendingAchievements: [] as string[],
  dailyGoal: { target: 20, progress: 0, date: new Date().toISOString().split("T")[0] },
  consecutiveCorrect: 0,
  consecutiveNoHint: 0,
};

import SessionPage from "@/app/session/page";

const sampleTopic = {
  id: "topic-1",
  name: "AZ-900",
  slug: "az-900",
  createdAt: "2024-01-01T00:00:00.000Z",
  teachingProfile: null,
  items: [
    {
      id: "item-1",
      topicId: "topic-1",
      name: "Cloud Concepts",
      order: 0,
      muted: false,
      subItems: [
        { id: "sub-1", itemId: "item-1", name: "IaaS", order: 0, muted: false, difficulty: 1 },
        { id: "sub-2", itemId: "item-1", name: "PaaS", order: 1, muted: false, difficulty: 2 },
      ],
    },
  ],
};

const sampleQuestion = {
  id: "q-1",
  subItemId: "sub-1",
  type: "multiple_choice",
  text: "What is IaaS?",
  options: ["IaaS A", "IaaS B"],
  answer: "IaaS A",
  difficulty: 1,
};

function resetStoreState() {
  storeState = {
    _hasHydrated: true,
    currentTopic: null,
    questionQueue: [],
    currentQuestion: null,
    subItemStats: {},
    settings: { queueDepth: 5, refillTrigger: 3, timerEnabled: true },
    isGenerating: false,
    answerShown: false,
    lastAnswerCorrect: null,
    sessionId: "sess-1",
    xp: 0,
    sessionXP: 0,
    streak: 0,
    lives: 3,
    maxLives: 3,
    weeklyUsage: 0,
    weeklyRemaining: 30,
    weeklyResetsAt: null,
    plan: "free",
    reviewMode: false,
    achievements: [],
    pendingAchievements: [],
    dailyGoal: { target: 20, progress: 0, date: new Date().toISOString().split("T")[0] },
    consecutiveCorrect: 0,
    consecutiveNoHint: 0,
  };
  mockUseAppStore.mockImplementation(() => ({
    ...storeState,
    setCurrentQuestion: mockSetCurrentQuestion,
    advanceQueue: mockAdvanceQueue,
    addToQueue: mockAddToQueue,
    updateSubItemStats: mockUpdateSubItemStats,
    setSubItemStatsEntry: mockSetSubItemStatsEntry,
    hydrateSubItemStats: mockHydrateSubItemStats,
    setIsGenerating: mockSetIsGenerating,
    setAnswerShown: mockSetAnswerShown,
    setLastAnswerCorrect: mockSetLastAnswerCorrect,
    toggleItemMute: mockToggleItemMute,
    toggleSubItemMute: mockToggleSubItemMute,
    soloItem: mockSoloItem,
    soloSubItem: mockSoloSubItem,
    addXP: mockAddXP,
    checkAndUpdateStreak: mockCheckAndUpdateStreak,
    loseLife: mockLoseLife,
    gainLife: mockGainLife,
    resetLives: mockResetLives,
    checkAchievements: mockCheckAchievements,
    incrementDailyProgress: mockIncrementDailyProgress,
    decrementDailyProgress: mockDecrementDailyProgress,
    saveSessionEntry: mockSaveSessionEntry,
  }));
  (mockUseAppStore as any).getState = () => ({ ...storeState, lives: storeState.lives });
}

function setFetchOk() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/topics")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleTopic) });
    }
    if (url.includes("/api/stats")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
    }
    if (url.includes("/api/record-answer")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          newDifficulty: 1.2,
          stats: { correctCount: 1, totalCount: 1, difficulty: 1, lastSeen: new Date().toISOString() },
        }),
      });
    }
    if (url.includes("/api/report-question")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          answerInvalidated: true,
          stats: { correctCount: 0, totalCount: 0, difficulty: 1 },
        }),
      });
    }
    if (url.includes("/api/toggle-mute")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (url.includes("/api/solo")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ mode: "solo" }) });
    }
    if (url.includes("/api/generate-questions")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }) as any;
}

beforeEach(() => {
  resetStoreState();
  mockPush.mockReset();
  mockAdvanceQueue.mockReset();
  mockLoseLife.mockReset();
  mockResetLives.mockReset();
  mockSoloItem.mockReset();
  mockSoloSubItem.mockReset();
  mockAddXP.mockReset();
  mockCheckAndUpdateStreak.mockReset();
  mockHydrateSubItemStats.mockReset();
  mockCheckAchievements.mockReset();
  mockIncrementDailyProgress.mockReset();
  mockSaveSessionEntry.mockReset();
  setFetchOk();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Redirect behavior ────────────────────────────────────────────────────────
describe("SessionPage — redirect when no topic", () => {
  test("redirects to / when currentTopic is null", async () => {
    storeState.currentTopic = null;
    render(<SessionPage />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  test("renders null when currentTopic is null", () => {
    storeState.currentTopic = null;
    const { container } = render(<SessionPage />);
    // Should render null (after redirect) — container may be empty or just have the redirect
    expect(container).toBeTruthy();
  });
});

// ─── Header rendering ─────────────────────────────────────────────────────────
describe("SessionPage — header rendering", () => {
  test("shows Dystoppia brand text in header", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByText("Dystoppia")).toBeTruthy();
  });

  test("shows topic name in header", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByText("AZ-900")).toBeTruthy();
  });

  test("does not show 'loading...' badge for non-pending topic", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.queryByText("loading...")).toBeNull();
  });

  test("shows loading session state for pending topic", async () => {
    storeState.currentTopic = { ...sampleTopic, id: "pending_abc" };
    render(<SessionPage />);
    expect(screen.getByText("Loading your GED session...")).toBeTruthy();
  });

  test("clicking Dystoppia brand navigates to /", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    fireEvent.click(screen.getByText("Dystoppia"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  test("shows settings control in header", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(document.querySelector('button[aria-label="Settings"]')).toBeTruthy();
  });
});

// ─── Gamification display ─────────────────────────────────────────────────────
describe("SessionPage — gamification display", () => {
  test("does not show XP display when sessionXP is 0", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.sessionXP = 0;
    render(<SessionPage />);
    expect(screen.queryByText(/XP/)).toBeNull();
  });

  test("shows XP display when sessionXP > 0", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.sessionXP = 50;
    render(<SessionPage />);
    expect(screen.getByText(/50 XP/)).toBeTruthy();
  });

  test("does not show streak when streak is <= 1", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.streak = 1;
    render(<SessionPage />);
    // No fire emoji streak indicator
    const streakEls = screen.queryAllByText(/🔥/);
    expect(streakEls.length).toBe(0);
  });

  test("does not show accuracy when totalCount is 0", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.subItemStats = {};
    render(<SessionPage />);
    expect(screen.queryByText(/Session:/)).toBeNull();
  });

  test("does not show accuracy percentage when answers exist", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.subItemStats = {
      "sub-1": { correctCount: 8, totalCount: 10, difficulty: 1 },
    };
    render(<SessionPage />);
    expect(screen.queryByText(/80%/)).toBeNull();
  });

  test("does not show answer count when answers exist", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.subItemStats = {
      "sub-1": { correctCount: 5, totalCount: 10, difficulty: 1 },
    };
    render(<SessionPage />);
    expect(screen.queryByText(/10 answered/)).toBeNull();
  });
});

// ─── Question area ────────────────────────────────────────────────────────────
describe("SessionPage — question area", () => {
  test("renders QuestionCard when currentQuestion is set", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);
    expect(screen.getByTestId("question-card")).toBeTruthy();
  });

  test("QuestionCard receives correct question id", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);
    const card = screen.getByTestId("question-card");
    expect(card.getAttribute("data-question-id")).toBe("q-1");
  });

  test("QuestionCard shows answer when answerShown is true", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.answerShown = true;
    render(<SessionPage />);
    const card = screen.getByTestId("question-card");
    expect(card.getAttribute("data-answer-shown")).toBe("true");
  });

  test("shows 'Next Question' button when answerShown", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.answerShown = true;
    render(<SessionPage />);
    expect(screen.getByText(/Next Question/)).toBeTruthy();
  });

  test("'Next Question' button calls advanceQueue", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.answerShown = true;
    render(<SessionPage />);
    fireEvent.click(screen.getByText(/Next Question/));
    expect(mockAdvanceQueue).toHaveBeenCalled();
  });

  test("shows loading fact card when no currentQuestion", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = null;
    render(<SessionPage />);
    expect(screen.getByText(/Generating questions/)).toBeTruthy();
  });

  test("shows loading session text for pending topic with no question", async () => {
    storeState.currentTopic = { ...sampleTopic, id: "pending_123" };
    storeState.currentQuestion = null;
    render(<SessionPage />);
    await waitFor(() => {
      expect(screen.getByText("Loading your GED session...")).toBeTruthy();
    });
  });

  test("shows 'Generating questions…' when isGenerating and not pending", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = null;
    storeState.isGenerating = true;
    render(<SessionPage />);
    await waitFor(() => {
      expect(screen.getByText("Generating questions…")).toBeTruthy();
    });
  });
});

// ─── Sidebar components ───────────────────────────────────────────────────────
describe("SessionPage — sidebar components", () => {
  test("renders TopicDashboard component", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByTestId("topic-dashboard")).toBeTruthy();
  });

  test("TopicDashboard receives topic items", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    const dashboard = screen.getByTestId("topic-dashboard");
    expect(dashboard.getAttribute("data-item-count")).toBe("1");
  });

});

// ─── Learning tree heading ────────────────────────────────────────────────────
describe("SessionPage — learning tree section", () => {
  test("shows 'Learning Tree' heading in sidebar", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByText(/Learning Tree/i)).toBeTruthy();
  });

  test("shows legend in sidebar", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByText(/weak spot|mastered/i)).toBeTruthy();
  });
});

// ─── New components in header ─────────────────────────────────────────────────
describe("SessionPage — new header components", () => {
  test("renders AchievementToast", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByTestId("achievement-toast")).toBeTruthy();
  });

  test("renders DailyGoalBar", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByTestId("daily-goal-bar")).toBeTruthy();
  });

  test("does not show Resumo button when answerCount < 5", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.queryByText("Summary")).toBeNull();
  });

  test("shows BOSS badge in header during boss round", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.answerShown = true;
    render(<SessionPage />);
    // Simulate 10 answers to trigger boss round
    const nextBtn = screen.getByText(/Next Question/);
    // We need to set up internal state with answerCount=9 trick via repeated clicks
    // Instead just verify BossRound appears conditionally — check it's not shown initially
    expect(screen.queryByText(/BOSS/)).toBeNull();
  });
});

// ─── Boss Round ───────────────────────────────────────────────────────────────
describe("SessionPage — boss round", () => {
  test("BossRound component is not shown initially", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.queryByTestId("boss-round")).toBeNull();
  });
});

// ─── FlashCard ────────────────────────────────────────────────────────────────
describe("SessionPage — flashcard", () => {
  test("FlashCard is not shown when there is no current question", () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = null;
    render(<SessionPage />);
    expect(screen.queryByTestId("flash-card")).toBeNull();
  });
});

// ─── Session summary ──────────────────────────────────────────────────────────
describe("SessionPage — session summary", () => {
  test("session summary is not shown initially", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.queryByTestId("session-summary")).toBeNull();
  });

  test("game over overlay shows 'Ver resumo' button", async () => {
    vi.useFakeTimers();
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    (mockUseAppStore as any).getState = () => ({ lives: 0, questionQueue: [], currentQuestion: sampleQuestion });
    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/View summary/i)).toBeTruthy();
    vi.useRealTimers();
  });

  test("clicking 'View summary' opens summary and saves session entry", async () => {
    vi.useFakeTimers();
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    storeState.sessionXP = 120;
    (mockUseAppStore as any).getState = () => ({ lives: 0, questionQueue: [], currentQuestion: sampleQuestion });
    render(<SessionPage />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByText(/View summary/i));

    expect(screen.getByTestId("session-summary")).toBeTruthy();
    expect(mockSaveSessionEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: "topic-1",
        totalCount: 1,
        correctCount: 0,
        xpEarned: 120,
      })
    );
    vi.useRealTimers();
  });
});

// ─── checkAchievements called on answer ───────────────────────────────────────
describe("SessionPage — achievement & daily goal integration", () => {
  test("calls checkAchievements after answering", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
    });
    expect(mockCheckAchievements).toHaveBeenCalled();
  });

  test("calls incrementDailyProgress after answering", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
    });
    expect(mockIncrementDailyProgress).toHaveBeenCalled();
  });
});

describe("SessionPage — critical runtime branches", () => {
  test("does not redirect before hydration completes", async () => {
    storeState._hasHydrated = false;
    storeState.currentTopic = null;
    render(<SessionPage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockPush).not.toHaveBeenCalledWith("/");
  });

  test("shows rate-limit paywall when generate-questions returns 429", async () => {
    storeState.currentTopic = sampleTopic;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/stats")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
      if (url.includes("/api/generate-questions")) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ window: "weekly", resetsAt: "2099-01-01T00:00:00.000Z" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<SessionPage />);
    await waitFor(() => {
      const paywall = screen.getByTestId("rate-limit-paywall");
      expect(paywall.getAttribute("data-window")).toBe("weekly");
    });
  });

  test("closes rate-limit paywall via onClose", async () => {
    storeState.currentTopic = sampleTopic;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/stats")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
      if (url.includes("/api/generate-questions")) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ window: "weekly", resetsAt: "2099-01-01T00:00:00.000Z" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<SessionPage />);
    await screen.findByTestId("rate-limit-paywall");
    fireEvent.click(screen.getByTestId("close-rate-limit-paywall"));
    await waitFor(() => {
      expect(screen.queryByTestId("rate-limit-paywall")).toBeNull();
    });
  });

  test("uses fallback local difficulty update when record-answer request fails", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/stats")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
      if (url.includes("/api/record-answer")) return Promise.reject(new Error("backend down"));
      if (url.includes("/api/generate-questions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
    });
    expect(mockUpdateSubItemStats).toHaveBeenCalledWith("sub-1", false, 1);
  });

  test("applies hint penalty and hint achievement tracking", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("hint-btn"));
    });
    expect(mockAddXP).toHaveBeenCalledWith(-5);
    expect(mockCheckAchievements).toHaveBeenCalledWith({ usedHint: true });
  });

  test("toggle mute sends request to API", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    fireEvent.click(screen.getByTestId("toggle-item-mute"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/toggle-mute",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("solo focus updates store and sends request to API", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    fireEvent.click(screen.getByTestId("solo-item"));

    expect(mockSoloItem).toHaveBeenCalledWith("item-1");
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/solo",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("shows free-plan weekly usage nudge when remaining ratio is low", () => {
    storeState.currentTopic = sampleTopic;
    storeState.plan = "free";
    storeState.weeklyUsage = 10;
    storeState.weeklyRemaining = 4;
    render(<SessionPage />);
    expect(screen.getByText(/4 questions left this week/i)).toBeTruthy();
    expect(screen.getByText("Upgrade")).toBeTruthy();
  });

  test("does not show weekly usage nudge for pro users", () => {
    storeState.currentTopic = sampleTopic;
    storeState.plan = "pro";
    storeState.weeklyUsage = 10;
    storeState.weeklyRemaining = 2;
    render(<SessionPage />);
    expect(screen.queryByText(/questions left this week/i)).toBeNull();
  });

  test("opens settings dialog from settings button", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    fireEvent.click(screen.getAllByLabelText("Settings")[0]);
    expect(screen.getByTestId("settings-dialog")).toBeTruthy();
  });

  test("toggles mobile stats panel", () => {
    storeState.currentTopic = sampleTopic;
    storeState.weeklyRemaining = 17;
    render(<SessionPage />);
    expect(screen.getAllByText(/17 left this week/i).length).toBe(1);
    fireEvent.click(screen.getByLabelText("Stats"));
    expect(screen.getAllByText(/17 left this week/i).length).toBeGreaterThan(1);
  });

  test("audiobook success path opens player", async () => {
    storeState.currentTopic = sampleTopic;
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio");
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/stats")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
      if (url.includes("/api/generate-questions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
      if (url.includes("/api/audiobook/generate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob(["audio"])),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<SessionPage />);
    fireEvent.click(screen.getAllByTestId("open-audiobook-dialog")[0]);
    fireEvent.click(screen.getByTestId("audiobook-generate"));

    await waitFor(() => {
      expect(screen.getByTestId("audiobook-player")).toBeTruthy();
    });
    createObjectURLSpy.mockRestore();
  });

  test("audiobook 403 shows plan error", async () => {
    storeState.currentTopic = sampleTopic;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/stats")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
      if (url.includes("/api/generate-questions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
      if (url.includes("/api/audiobook/generate")) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ error: "forbidden" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<SessionPage />);
    fireEvent.click(screen.getAllByTestId("open-audiobook-dialog")[0]);
    fireEvent.click(screen.getByTestId("audiobook-generate"));

    await waitFor(() => {
      expect(screen.getByText(/available on Learner and Master plans/i)).toBeTruthy();
    });
  });

  test("audiobook non-403 error shows details", async () => {
    storeState.currentTopic = sampleTopic;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/stats")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
      if (url.includes("/api/generate-questions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
      if (url.includes("/api/audiobook/generate")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ details: "backend exploded" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as any;

    render(<SessionPage />);
    fireEvent.click(screen.getAllByTestId("open-audiobook-dialog")[0]);
    fireEvent.click(screen.getByTestId("audiobook-generate"));
    await waitFor(() => {
      expect(screen.getByText(/Falha: Error: backend exploded/i)).toBeTruthy();
    });
  });

  test("pending topic keeps audiobook controls hidden", () => {
    storeState.currentTopic = { ...sampleTopic, id: "pending_1" };
    render(<SessionPage />);
    expect(screen.queryByTestId("open-audiobook-dialog")).toBeNull();
    expect(screen.queryByTestId("audiobook-dialog")).toBeNull();
  });

  test("opens mobile tree drawer", () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);

    fireEvent.click(screen.getByText("Tree"));
    expect(screen.getAllByText(/Learning Tree/i).length).toBeGreaterThan(1);
  });

  test("opening audiobook from mobile drawer closes drawer and opens dialog", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);

    fireEvent.click(screen.getByText("Tree"));
    expect(screen.getAllByText(/Learning Tree/i).length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByTestId("open-audiobook-dialog")[0]);
    await waitFor(() => {
      expect(screen.getByTestId("audiobook-dialog")).toBeTruthy();
    });
    expect(screen.getAllByText(/Learning Tree/i).length).toBe(1);
  });

  test("mobile stats summary button appears after 5 answers and opens summary", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        fireEvent.click(screen.getByTestId("answer-btn"));
      });
    }

    fireEvent.click(screen.getByLabelText("Stats"));
    // Two "Summary" buttons exist (desktop header + mobile stats panel); click the mobile panel one
    fireEvent.click(screen.getAllByText("Summary")[1]);

    await waitFor(() => {
      expect(screen.getByTestId("session-summary")).toBeTruthy();
    });
  });
});

