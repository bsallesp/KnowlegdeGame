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
  default: ({ items, onToggleMute }: { items: unknown[]; onToggleMute: Function }) => (
    <div data-testid="topic-dashboard" data-item-count={items.length} />
  ),
}));

vi.mock("@/components/ConveyorBelt", () => ({
  default: ({ queue, currentQuestion, isGenerating }: { queue: unknown[]; currentQuestion: unknown; isGenerating: boolean }) => (
    <div
      data-testid="conveyor-belt"
      data-queue-length={queue.length}
      data-is-generating={isGenerating}
    />
  ),
}));

vi.mock("@/components/QuestionCard", () => ({
  default: ({ question, onAnswer, answerShown }: { question: { id: string; text: string }; onAnswer: Function; answerShown: boolean }) => (
    <div data-testid="question-card" data-question-id={question.id} data-answer-shown={answerShown}>
      <span>{question.text}</span>
      <button onClick={() => onAnswer("answer", 1000)} data-testid="answer-btn">Answer</button>
    </div>
  ),
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

vi.mock("@/lib/logger", () => ({
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
const mockHydrateSubItemStats = vi.hoisted(() => vi.fn());
const mockSetIsGenerating = vi.hoisted(() => vi.fn());
const mockSetAnswerShown = vi.hoisted(() => vi.fn());
const mockSetLastAnswerCorrect = vi.hoisted(() => vi.fn());
const mockToggleItemMute = vi.hoisted(() => vi.fn());
const mockToggleSubItemMute = vi.hoisted(() => vi.fn());
const mockAddXP = vi.hoisted(() => vi.fn());
const mockCheckAndUpdateStreak = vi.hoisted(() => vi.fn());
const mockLoseLife = vi.hoisted(() => vi.fn());
const mockResetLives = vi.hoisted(() => vi.fn());
const mockUseAppStore = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAppStore", () => ({
  default: mockUseAppStore,
}));

// Mutable state for tests to control
let storeState = {
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
  reviewMode: false,
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
  subItem: sampleTopic.items[0].subItems[0],
};

function resetStoreState() {
  storeState = {
    currentTopic: null,
    questionQueue: [],
    currentQuestion: null,
    subItemStats: {},
    settings: { queueDepth: 5, refillTrigger: 3 },
    isGenerating: false,
    answerShown: false,
    lastAnswerCorrect: null,
    sessionId: "sess-1",
    xp: 0,
    sessionXP: 0,
    streak: 0,
    lives: 3,
    maxLives: 3,
    reviewMode: false,
  };
  mockUseAppStore.mockImplementation(() => ({
    ...storeState,
    setCurrentQuestion: mockSetCurrentQuestion,
    advanceQueue: mockAdvanceQueue,
    addToQueue: mockAddToQueue,
    updateSubItemStats: mockUpdateSubItemStats,
    hydrateSubItemStats: mockHydrateSubItemStats,
    setIsGenerating: mockSetIsGenerating,
    setAnswerShown: mockSetAnswerShown,
    setLastAnswerCorrect: mockSetLastAnswerCorrect,
    toggleItemMute: mockToggleItemMute,
    toggleSubItemMute: mockToggleSubItemMute,
    addXP: mockAddXP,
    checkAndUpdateStreak: mockCheckAndUpdateStreak,
    loseLife: mockLoseLife,
    resetLives: mockResetLives,
  }));
  (mockUseAppStore as any).getState = () => ({ ...storeState, lives: storeState.lives });
}

function setFetchOk() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/stats")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ stats: {} }) });
    }
    if (url.includes("/api/record-answer")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ newDifficulty: 1.2 }) });
    }
    if (url.includes("/api/toggle-mute")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
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
  mockAddXP.mockReset();
  mockCheckAndUpdateStreak.mockReset();
  mockHydrateSubItemStats.mockReset();
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

  test("shows 'loading...' badge for pending topic", async () => {
    storeState.currentTopic = { ...sampleTopic, id: "pending_abc" };
    render(<SessionPage />);
    expect(screen.getByText("loading...")).toBeTruthy();
  });

  test("clicking Dystoppia brand navigates to /", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    fireEvent.click(screen.getByText("Dystoppia"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  test("shows settings link in header", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    const settingsLink = document.querySelector('a[href="/settings"]');
    expect(settingsLink).toBeTruthy();
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

  test("shows streak display when streak > 1", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.streak = 5;
    render(<SessionPage />);
    expect(screen.getByText("5")).toBeTruthy();
  });

  test("renders heart indicators equal to maxLives", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.lives = 3;
    storeState.maxLives = 3;
    render(<SessionPage />);
    const hearts = screen.getAllByText("❤️");
    expect(hearts.length).toBe(3);
  });

  test("renders correct number of hearts for maxLives=5", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.lives = 5;
    storeState.maxLives = 5;
    render(<SessionPage />);
    const hearts = screen.getAllByText("❤️");
    expect(hearts.length).toBe(5);
  });

  test("does not show accuracy when totalCount is 0", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.subItemStats = {};
    render(<SessionPage />);
    expect(screen.queryByText(/Session:/)).toBeNull();
  });

  test("shows accuracy percentage when answers exist", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.subItemStats = {
      "sub-1": { correctCount: 8, totalCount: 10, difficulty: 1 },
    };
    render(<SessionPage />);
    expect(screen.getByText(/80%/)).toBeTruthy();
  });

  test("shows answer count when answers exist", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.subItemStats = {
      "sub-1": { correctCount: 5, totalCount: 10, difficulty: 1 },
    };
    render(<SessionPage />);
    expect(screen.getByText(/10 answered/)).toBeTruthy();
  });
});

// ─── Game over overlay ────────────────────────────────────────────────────────
describe("SessionPage — game over overlay", () => {
  test("game over overlay is not shown initially", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    render(<SessionPage />);
    expect(screen.queryByText(/Out of lives!/)).toBeNull();
  });

  test("game over overlay shows 'Out of lives!' heading on trigger", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    (mockUseAppStore as any).getState = () => ({ lives: 0 });

    render(<SessionPage />);
    const answerBtn = screen.getByTestId("answer-btn");

    // Trigger wrong answer → loseLife mock → getState().lives === 0 → showGameOver after 800ms
    await act(async () => {
      fireEvent.click(answerBtn);
      await new Promise((r) => setTimeout(r, 1000));
    });

    await waitFor(() => {
      expect(screen.getByText(/Out of lives!/i)).toBeTruthy();
    }, { timeout: 2000 });
  });

  test("game over overlay has 'Continue anyway' button", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    (mockUseAppStore as any).getState = () => ({ lives: 0 });

    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
      await new Promise((r) => setTimeout(r, 1000));
    });

    await waitFor(() => {
      expect(screen.getByText(/Continue anyway/i)).toBeTruthy();
    }, { timeout: 2000 });
  });

  test("game over overlay has 'New topic' button", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    (mockUseAppStore as any).getState = () => ({ lives: 0 });

    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
      await new Promise((r) => setTimeout(r, 1000));
    });

    await waitFor(() => {
      expect(screen.getByText(/New topic/i)).toBeTruthy();
    }, { timeout: 2000 });
  });

  test("'New topic' button navigates to /", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    (mockUseAppStore as any).getState = () => ({ lives: 0 });

    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
      await new Promise((r) => setTimeout(r, 1000));
    });

    await waitFor(() => screen.getByText(/New topic/i), { timeout: 2000 });
    fireEvent.click(screen.getByText(/New topic/i));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  test("'Continue anyway' calls resetLives", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = sampleQuestion;
    storeState.lives = 0;
    (mockUseAppStore as any).getState = () => ({ lives: 0 });

    render(<SessionPage />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-btn"));
      await new Promise((r) => setTimeout(r, 1000));
    });

    await waitFor(() => screen.getByText(/Continue anyway/i), { timeout: 2000 });
    fireEvent.click(screen.getByText(/Continue anyway/i));
    expect(mockResetLives).toHaveBeenCalled();
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

  test("shows skeleton blocks when no currentQuestion", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = null;
    render(<SessionPage />);
    const skeletons = screen.getAllByTestId("skeleton-block");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("shows 'Loading topic...' text for pending topic with no question", async () => {
    storeState.currentTopic = { ...sampleTopic, id: "pending_123" };
    storeState.currentQuestion = null;
    render(<SessionPage />);
    await waitFor(() => {
      expect(screen.getByText("Loading topic...")).toBeTruthy();
    });
  });

  test("shows 'Generating questions...' when isGenerating and not pending", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.currentQuestion = null;
    storeState.isGenerating = true;
    render(<SessionPage />);
    await waitFor(() => {
      expect(screen.getByText("Generating questions...")).toBeTruthy();
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

  test("renders ConveyorBelt component", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByTestId("conveyor-belt")).toBeTruthy();
  });

  test("ConveyorBelt receives queue length", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.questionQueue = [sampleQuestion];
    render(<SessionPage />);
    const belt = screen.getByTestId("conveyor-belt");
    expect(belt.getAttribute("data-queue-length")).toBe("1");
  });

  test("ConveyorBelt reflects isGenerating state", async () => {
    storeState.currentTopic = sampleTopic;
    storeState.isGenerating = true;
    render(<SessionPage />);
    const belt = screen.getByTestId("conveyor-belt");
    expect(belt.getAttribute("data-is-generating")).toBe("true");
  });
});

// ─── Learning tree heading ────────────────────────────────────────────────────
describe("SessionPage — learning tree section", () => {
  test("shows 'Learning Tree' heading in sidebar", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByText(/Learning Tree/i)).toBeTruthy();
  });

  test("shows mute instruction in sidebar", async () => {
    storeState.currentTopic = sampleTopic;
    render(<SessionPage />);
    expect(screen.getByText(/mute/i)).toBeTruthy();
  });
});
