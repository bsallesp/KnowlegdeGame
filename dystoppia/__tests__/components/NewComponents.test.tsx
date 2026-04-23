import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ─── Framer-motion stub ───────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <div {...rest}>{children}</div>;
    },
    button: ({ children, onClick, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <button onClick={onClick as any} {...rest}>{children}</button>;
    },
    p: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = p as any;
      return <p {...rest}>{children}</p>;
    },
    span: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = p as any;
      return <span {...rest}>{children}</span>;
    },
    h2: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = p as any;
      return <h2 {...rest}>{children}</h2>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ─── Store mock (shared) ──────────────────────────────────────────────────────
const mockDismissAchievement = vi.hoisted(() => vi.fn());
const mockUseAppStore = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAppStore", () => ({
  default: mockUseAppStore,
}));

// ─── fetch mock ───────────────────────────────────────────────────────────────
global.fetch = vi.fn();

// =============================================================================
// AchievementToast
// =============================================================================
import AchievementToast from "@/components/AchievementToast";

const baseAchievements = [
  { id: "first_answer", name: "First Step",  description: "First answer", icon: "🎯", unlockedAt: null },
  { id: "xp_100",      name: "Centurion",   description: "100 XP",            icon: "⚡", unlockedAt: null },
];

describe("AchievementToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      pendingAchievements: [],
      dismissAchievement: mockDismissAchievement,
    });
  });

  test("renders nothing when no pending achievements", () => {
    const { container } = render(<AchievementToast />);
    expect(container.textContent).toBe("");
  });

  test("shows achievement name when there is a pending one", () => {
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      pendingAchievements: ["first_answer"],
      dismissAchievement: mockDismissAchievement,
    });
    render(<AchievementToast />);
    expect(screen.getByText("First Step")).toBeTruthy();
  });

  test("shows achievement icon", () => {
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      pendingAchievements: ["first_answer"],
      dismissAchievement: mockDismissAchievement,
    });
    render(<AchievementToast />);
    expect(screen.getByText("🎯")).toBeTruthy();
  });

  test("shows 'Achievement unlocked!' label", () => {
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      pendingAchievements: ["xp_100"],
      dismissAchievement: mockDismissAchievement,
    });
    render(<AchievementToast />);
    expect(screen.getByText("Achievement unlocked!")).toBeTruthy();
  });

  test("auto-dismisses after 4 seconds", async () => {
    vi.useFakeTimers();
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      pendingAchievements: ["first_answer"],
      dismissAchievement: mockDismissAchievement,
    });
    render(<AchievementToast />);
    vi.advanceTimersByTime(4100);
    expect(mockDismissAchievement).toHaveBeenCalledWith("first_answer");
    vi.useRealTimers();
  });
});

// =============================================================================
// DailyGoalBar
// =============================================================================
import DailyGoalBar from "@/components/DailyGoalBar";

const today = new Date().toISOString().split("T")[0];

describe("DailyGoalBar", () => {
  test("shows current progress and target", () => {
    mockUseAppStore.mockReturnValue({
      dailyGoal: { target: 20, progress: 5, date: today },
    });
    render(<DailyGoalBar />);
    expect(screen.getByText("🎯 5/20")).toBeTruthy();
  });

  test("shows trophy icon when goal is reached", () => {
    mockUseAppStore.mockReturnValue({
      dailyGoal: { target: 20, progress: 20, date: today },
    });
    render(<DailyGoalBar />);
    expect(screen.getByText("🎖️ 20/20")).toBeTruthy();
  });

  test("shows target icon when goal is not reached", () => {
    mockUseAppStore.mockReturnValue({
      dailyGoal: { target: 20, progress: 10, date: today },
    });
    render(<DailyGoalBar />);
    expect(screen.getByText("🎯 10/20")).toBeTruthy();
  });

  test("shows 0/target when date is different from today", () => {
    mockUseAppStore.mockReturnValue({
      dailyGoal: { target: 20, progress: 15, date: "2020-01-01" },
    });
    render(<DailyGoalBar />);
    expect(screen.getByText("🎯 0/20")).toBeTruthy();
  });
});

// =============================================================================
// BossRound
// =============================================================================
import BossRound from "@/components/BossRound";

describe("BossRound", () => {
  test("renders BOSS ROUND title", () => {
    render(<BossRound onReady={vi.fn()} />);
    expect(screen.getByText("BOSS ROUND")).toBeTruthy();
  });

  test("renders the sword emoji", () => {
    render(<BossRound onReady={vi.fn()} />);
    expect(screen.getByText("⚔️")).toBeTruthy();
  });

  test("calls onReady when button is clicked", () => {
    const onReady = vi.fn();
    render(<BossRound onReady={onReady} />);
    fireEvent.click(screen.getByText(/Face the Boss/i));
    expect(onReady).toHaveBeenCalledOnce();
  });

  test("shows 2x XP text", () => {
    render(<BossRound onReady={vi.fn()} />);
    expect(screen.getByText(/2× XP/)).toBeTruthy();
  });
});

// =============================================================================
// FlashCard
// =============================================================================
import FlashCard from "@/components/FlashCard";

const mockSubItem = {
  id: "sub-1",
  itemId: "item-1",
  name: "CIA Triad Principles",
  order: 0,
  muted: false,
  difficulty: 2,
};

describe("FlashCard", () => {
  test("renders subItem name", () => {
    render(<FlashCard subItem={mockSubItem} topicName="Cyber Security" onReady={vi.fn()} />);
    expect(screen.getByText("CIA Triad Principles")).toBeTruthy();
  });

  test("renders topic name", () => {
    render(<FlashCard subItem={mockSubItem} topicName="Cyber Security" onReady={vi.fn()} />);
    expect(screen.getByText("Cyber Security")).toBeTruthy();
  });

  test("shows difficulty label for level 2", () => {
    render(<FlashCard subItem={mockSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/Basic/)).toBeTruthy();
  });

  test("shows difficulty label Expert for level 5", () => {
    render(<FlashCard subItem={{ ...mockSubItem, difficulty: 5 }} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/Expert/)).toBeTruthy();
  });

  test("calls onReady when button is clicked", () => {
    const onReady = vi.fn();
    render(<FlashCard subItem={mockSubItem} topicName="Topic" onReady={onReady} />);
    fireEvent.click(screen.getByText(/Let's go/));
    expect(onReady).toHaveBeenCalledOnce();
  });

  test("shows default subtitle for difficulty > 1", () => {
    render(<FlashCard subItem={mockSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/Next:/)).toBeTruthy();
  });

  test("does NOT show onboarding banner for difficulty > 1", () => {
    render(<FlashCard subItem={mockSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.queryByText(/Focus now:/)).toBeNull();
  });
});

// ─── FlashCard — beginner / practical onboarding ─────────────────────────────

describe("FlashCard — difficulty 1 (practical onboarding)", () => {
  const beginnerSubItem = { ...mockSubItem, difficulty: 1 };

  test("shows 'Beginner' difficulty label", () => {
    render(<FlashCard subItem={beginnerSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/Beginner/)).toBeTruthy();
  });

  test("shows practical onboarding banner", () => {
    render(<FlashCard subItem={beginnerSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/Practical onboarding/)).toBeTruthy();
  });

  test("banner explains the learning focus", () => {
    render(<FlashCard subItem={beginnerSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/signal recognition first/i)).toBeTruthy();
  });

  test("shows calibration subtitle explaining progression requirement", () => {
    render(<FlashCard subItem={beginnerSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.getByText(/signal recognition first/i)).toBeTruthy();
  });

  test("does NOT show default subtitle when difficulty is 1", () => {
    render(<FlashCard subItem={beginnerSubItem} topicName="Topic" onReady={vi.fn()} />);
    expect(screen.queryByText(/Next:/)).toBeNull();
  });

  test("still calls onReady when button is clicked at difficulty 1", () => {
    const onReady = vi.fn();
    render(<FlashCard subItem={beginnerSubItem} topicName="Topic" onReady={onReady} />);
    fireEvent.click(screen.getByText(/Let's go/));
    expect(onReady).toHaveBeenCalledOnce();
  });
});

// =============================================================================
// SessionSummary
// =============================================================================
import SessionSummary from "@/components/SessionSummary";

describe("SessionSummary", () => {
  const defaultProps = {
    answerCount: 20,
    correctCount: 16,
    sessionXP: 100,
    topicName: "Cyber Security",
    onContinue: vi.fn(),
    onNewTopic: vi.fn(),
  };

  beforeEach(() => {
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      subItemStats: {},
      streak: 3,
      currentTopic: null,
    });
  });

  test("renders topic name", () => {
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText("Cyber Security")).toBeTruthy();
  });

  test("shows correct answer count", () => {
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText("20")).toBeTruthy();
  });

  test("shows accuracy rate (80%)", () => {
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText("80%")).toBeTruthy();
  });

  test("shows XP gained", () => {
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText("+100")).toBeTruthy();
  });

  test("shows streak when streak > 0", () => {
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText(/3 days streak/)).toBeTruthy();
  });

  test("calls onContinue when 'Keep practicing' button is clicked", () => {
    const onContinue = vi.fn();
    render(<SessionSummary {...defaultProps} onContinue={onContinue} />);
    fireEvent.click(screen.getByText(/Keep practicing/));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  test("calls onNewTopic when 'New topic' button is clicked", () => {
    const onNewTopic = vi.fn();
    render(<SessionSummary {...defaultProps} onNewTopic={onNewTopic} />);
    fireEvent.click(screen.getByText(/New topic/));
    expect(onNewTopic).toHaveBeenCalledOnce();
  });

  test("shows grade 'Excellent!' when rate >= 90%", () => {
    render(<SessionSummary {...defaultProps} answerCount={10} correctCount={9} />);
    expect(screen.getByText("Excellent!")).toBeTruthy();
  });

  test("shows grade 'Keep practicing' when rate < 50%", () => {
    render(<SessionSummary {...defaultProps} answerCount={10} correctCount={4} />);
    expect(screen.getByRole("heading", { name: "Keep practicing" })).toBeTruthy();
  });

  test("shows achievements unlocked recently", () => {
    const recentUnlock = new Date().toISOString();
    mockUseAppStore.mockReturnValue({
      achievements: [
        { id: "first_answer", name: "First Step", description: "...", icon: "🎯", unlockedAt: recentUnlock },
      ],
      subItemStats: {},
      streak: 0,
      currentTopic: null,
    });
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText("First Step")).toBeTruthy();
  });

  test("shows sub-item real name in weak spots", () => {
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      subItemStats: {
        "sub-abc": { correctCount: 0, totalCount: 5, difficulty: 1 },
      },
      streak: 0,
      currentTopic: {
        id: "t1",
        name: "Topic",
        slug: "topic",
        createdAt: new Date().toISOString(),
        teachingProfile: null,
        items: [{
          id: "item-1",
          topicId: "t1",
          name: "Item 1",
          order: 0,
          muted: false,
          subItems: [{ id: "sub-abc", itemId: "item-1", name: "CIA Triad", order: 0, muted: false, difficulty: 1 }],
        }],
      },
    });
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText(/CIA Triad/)).toBeTruthy();
  });

  test("falls back to sub-item ID when topic has no matching subItem", () => {
    mockUseAppStore.mockReturnValue({
      achievements: baseAchievements,
      subItemStats: {
        "unknown-id": { correctCount: 0, totalCount: 5, difficulty: 1 },
      },
      streak: 0,
      currentTopic: null,
    });
    render(<SessionSummary {...defaultProps} />);
    expect(screen.getByText(/unknown-id/)).toBeTruthy();
  });
});

// =============================================================================
// ProgressChart
// =============================================================================
import ProgressChart from "@/components/ProgressChart";

describe("ProgressChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows loading text initially", () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {})); // never resolves
    render(<ProgressChart />);
    expect(screen.getByText(/Loading history/)).toBeTruthy();
  });

  test("shows empty state when no history", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ history: [] }),
    });
    render(<ProgressChart />);
    await waitFor(() => expect(screen.getByText(/No data yet/)).toBeTruthy());
  });

  test("shows error state when fetch fails (network error)", async () => {
    (global.fetch as any).mockRejectedValue(new Error("network error"));
    render(<ProgressChart />);
    await waitFor(() => expect(screen.getByText(/Error loading history/)).toBeTruthy());
  });

  test("shows error state when API returns non-ok status", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });
    render(<ProgressChart />);
    await waitFor(() => expect(screen.getByText(/Error loading history/)).toBeTruthy());
  });

  test("does not show loading after error", async () => {
    (global.fetch as any).mockRejectedValue(new Error("fail"));
    render(<ProgressChart />);
    await waitFor(() => expect(screen.queryByText(/Loading history/)).toBeNull());
  });

  test("renders chart bars when history exists", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        history: [
          { date: "2024-01-01", correct: 8, total: 10, rate: 80 },
          { date: "2024-01-02", correct: 5, total: 10, rate: 50 },
        ],
      }),
    });
    render(<ProgressChart />);
    await waitFor(() => expect(screen.getByText("History (14 days)")).toBeTruthy());
  });

  test("fetches with topicId param when provided", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ history: [] }),
    });
    render(<ProgressChart topicId="topic-abc" />);
    await waitFor(() => {
      const url: string = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("topicId=topic-abc");
    });
  });

  test("fetches with custom days param", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ history: [] }),
    });
    render(<ProgressChart days={7} />);
    await waitFor(() => {
      const url: string = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("days=7");
    });
  });
});

