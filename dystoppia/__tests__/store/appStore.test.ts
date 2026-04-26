import { describe, test, expect, beforeEach } from "vitest";
import useAppStore from "@/store/useAppStore";
import type { Topic, Question } from "@/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSubItem = {
  id: "sub-1",
  itemId: "item-1",
  name: "IaaS vs PaaS",
  order: 0,
  muted: false,
  difficulty: 1,
};

const mockItem = {
  id: "item-1",
  topicId: "topic-1",
  name: "Cloud Concepts",
  order: 0,
  muted: false,
  subItems: [mockSubItem],
};

const mockTopic: Topic = {
  id: "topic-1",
  name: "AZ-900",
  slug: "az-900",
  createdAt: new Date().toISOString(),
  items: [mockItem],
};

const makeQuestion = (id: string, subItemId = "sub-1"): Question => ({
  id,
  subItemId,
  type: "multiple_choice",
  content: `Question ${id}`,
  options: ["A", "B", "C", "D"],
  answer: "A",
  explanation: "Because A.",
  difficulty: 1,
  createdAt: new Date().toISOString(),
});

// Reset store state before each test
beforeEach(() => {
  useAppStore.setState({
    currentTopic: null,
    questionQueue: [],
    currentQuestion: null,
    subItemStats: {},
    isGenerating: false,
    answerShown: false,
    lastAnswerCorrect: null,
  });
});

// ─── setCurrentTopic ──────────────────────────────────────────────────────────

describe("setCurrentTopic", () => {
  test("sets the current topic", () => {
    useAppStore.getState().setCurrentTopic(mockTopic);
    expect(useAppStore.getState().currentTopic).toEqual(mockTopic);
  });

  test("replaces a previously set topic", () => {
    useAppStore.getState().setCurrentTopic(mockTopic);
    const newTopic = { ...mockTopic, id: "topic-2", name: "AWS" };
    useAppStore.getState().setCurrentTopic(newTopic);
    expect(useAppStore.getState().currentTopic?.name).toBe("AWS");
  });
});

// ─── setQuestionQueue ────────────────────────────────────────────────────────

describe("setQuestionQueue", () => {
  test("replaces the entire queue", () => {
    const q1 = makeQuestion("q1");
    const q2 = makeQuestion("q2");
    useAppStore.getState().setQuestionQueue([q1, q2]);
    expect(useAppStore.getState().questionQueue).toHaveLength(2);
  });

  test("replaces an existing queue", () => {
    useAppStore.getState().setQuestionQueue([makeQuestion("old")]);
    useAppStore.getState().setQuestionQueue([makeQuestion("new")]);
    expect(useAppStore.getState().questionQueue[0].id).toBe("new");
  });
});

// ─── addToQueue ───────────────────────────────────────────────────────────────

describe("addToQueue", () => {
  test("appends questions to an empty queue", () => {
    useAppStore.getState().addToQueue([makeQuestion("q1"), makeQuestion("q2")]);
    expect(useAppStore.getState().questionQueue).toHaveLength(2);
  });

  test("appends to an existing queue without losing items", () => {
    useAppStore.getState().setQuestionQueue([makeQuestion("q1")]);
    useAppStore.getState().addToQueue([makeQuestion("q2"), makeQuestion("q3")]);
    expect(useAppStore.getState().questionQueue).toHaveLength(3);
  });

  test("preserves the order (existing first, new last)", () => {
    useAppStore.getState().setQuestionQueue([makeQuestion("first")]);
    useAppStore.getState().addToQueue([makeQuestion("second")]);
    const queue = useAppStore.getState().questionQueue;
    expect(queue[0].id).toBe("first");
    expect(queue[1].id).toBe("second");
  });
});

// ─── advanceQueue ─────────────────────────────────────────────────────────────

describe("advanceQueue", () => {
  test("sets currentQuestion to the first item in queue", () => {
    useAppStore.getState().setQuestionQueue([makeQuestion("q1"), makeQuestion("q2")]);
    useAppStore.getState().advanceQueue();
    expect(useAppStore.getState().currentQuestion?.id).toBe("q1");
  });

  test("removes the first item from the queue after advancing", () => {
    useAppStore.getState().setQuestionQueue([makeQuestion("q1"), makeQuestion("q2")]);
    useAppStore.getState().advanceQueue();
    expect(useAppStore.getState().questionQueue).toHaveLength(1);
    expect(useAppStore.getState().questionQueue[0].id).toBe("q2");
  });

  test("sets currentQuestion to null when queue is empty", () => {
    useAppStore.getState().advanceQueue();
    expect(useAppStore.getState().currentQuestion).toBeNull();
  });

  test("resets answerShown to false after advancing", () => {
    useAppStore.setState({ answerShown: true });
    useAppStore.getState().setQuestionQueue([makeQuestion("q1")]);
    useAppStore.getState().advanceQueue();
    expect(useAppStore.getState().answerShown).toBe(false);
  });

  test("resets lastAnswerCorrect to null after advancing", () => {
    useAppStore.setState({ lastAnswerCorrect: true });
    useAppStore.getState().setQuestionQueue([makeQuestion("q1")]);
    useAppStore.getState().advanceQueue();
    expect(useAppStore.getState().lastAnswerCorrect).toBeNull();
  });
});

// ─── updateSubItemStats ───────────────────────────────────────────────────────

describe("updateSubItemStats", () => {
  test("creates a new stats entry for an unknown subItemId", () => {
    useAppStore.getState().updateSubItemStats("sub-new", true, 1);
    expect(useAppStore.getState().subItemStats["sub-new"]).toBeDefined();
  });

  test("increments correctCount on a correct answer", () => {
    useAppStore.getState().updateSubItemStats("sub-1", true, 1);
    expect(useAppStore.getState().subItemStats["sub-1"].correctCount).toBe(1);
  });

  test("does NOT increment correctCount on a wrong answer", () => {
    useAppStore.getState().updateSubItemStats("sub-1", false, 1);
    expect(useAppStore.getState().subItemStats["sub-1"].correctCount).toBe(0);
  });

  test("increments totalCount on any answer (correct or wrong)", () => {
    useAppStore.getState().updateSubItemStats("sub-1", true, 1);
    useAppStore.getState().updateSubItemStats("sub-1", false, 1);
    expect(useAppStore.getState().subItemStats["sub-1"].totalCount).toBe(2);
  });

  test("stores the difficulty passed as argument", () => {
    useAppStore.getState().updateSubItemStats("sub-1", true, 3);
    expect(useAppStore.getState().subItemStats["sub-1"].difficulty).toBe(3);
  });

  test("sets lastSeen to a valid ISO string", () => {
    useAppStore.getState().updateSubItemStats("sub-1", true, 1);
    const { lastSeen } = useAppStore.getState().subItemStats["sub-1"];
    expect(lastSeen).toBeDefined();
    expect(new Date(lastSeen!).toISOString()).toBe(lastSeen);
  });

  test("accumulates across multiple answers", () => {
    useAppStore.getState().updateSubItemStats("sub-1", true, 1);
    useAppStore.getState().updateSubItemStats("sub-1", true, 1);
    useAppStore.getState().updateSubItemStats("sub-1", false, 1);
    const stats = useAppStore.getState().subItemStats["sub-1"];
    expect(stats.correctCount).toBe(2);
    expect(stats.totalCount).toBe(3);
  });
});

// ─── setSettings ──────────────────────────────────────────────────────────────

describe("setSettings", () => {
  test("updates a single setting without touching the rest", () => {
    useAppStore.getState().setSettings({ queueDepth: 8 });
    const { settings } = useAppStore.getState();
    expect(settings.queueDepth).toBe(8);
    expect(settings.refillTrigger).toBe(3); // unchanged default
  });

  test("updates both settings at once", () => {
    useAppStore.getState().setSettings({ queueDepth: 7, refillTrigger: 3 });
    const { settings } = useAppStore.getState();
    expect(settings.queueDepth).toBe(7);
    expect(settings.refillTrigger).toBe(3);
  });
});

// ─── resetSession ─────────────────────────────────────────────────────────────

describe("resetSession", () => {
  test("clears currentTopic", () => {
    useAppStore.getState().setCurrentTopic(mockTopic);
    useAppStore.getState().resetSession();
    expect(useAppStore.getState().currentTopic).toBeNull();
  });

  test("clears the question queue", () => {
    useAppStore.getState().setQuestionQueue([makeQuestion("q1")]);
    useAppStore.getState().resetSession();
    expect(useAppStore.getState().questionQueue).toHaveLength(0);
  });

  test("clears currentQuestion", () => {
    useAppStore.setState({ currentQuestion: makeQuestion("q1") });
    useAppStore.getState().resetSession();
    expect(useAppStore.getState().currentQuestion).toBeNull();
  });

  test("clears subItemStats", () => {
    useAppStore.getState().updateSubItemStats("sub-1", true, 1);
    useAppStore.getState().resetSession();
    expect(useAppStore.getState().subItemStats).toEqual({});
  });

  test("resets isGenerating to false", () => {
    useAppStore.setState({ isGenerating: true });
    useAppStore.getState().resetSession();
    expect(useAppStore.getState().isGenerating).toBe(false);
  });
});

// ─── toggleItemMute ───────────────────────────────────────────────────────────

describe("toggleItemMute", () => {
  test("toggles item muted from false to true", () => {
    useAppStore.getState().setCurrentTopic(mockTopic);
    useAppStore.getState().toggleItemMute("item-1");
    const item = useAppStore.getState().currentTopic!.items[0];
    expect(item.muted).toBe(true);
  });

  test("toggles item muted from true back to false", () => {
    const mutedTopic = {
      ...mockTopic,
      items: [{ ...mockItem, muted: true }],
    };
    useAppStore.getState().setCurrentTopic(mutedTopic);
    useAppStore.getState().toggleItemMute("item-1");
    expect(useAppStore.getState().currentTopic!.items[0].muted).toBe(false);
  });

  test("is a no-op when currentTopic is null", () => {
    expect(() => useAppStore.getState().toggleItemMute("item-1")).not.toThrow();
    expect(useAppStore.getState().currentTopic).toBeNull();
  });
});

describe("soloItem", () => {
  test("keeps only the selected item active", () => {
    const otherSubItem = { ...mockSubItem, id: "sub-2", itemId: "item-2", name: "Storage" };
    const topicWithTwoItems = {
      ...mockTopic,
      items: [
        { ...mockItem, id: "item-1", subItems: [{ ...mockSubItem, id: "sub-1", itemId: "item-1" }] },
        { ...mockItem, id: "item-2", name: "Security", subItems: [otherSubItem] },
      ],
    };

    useAppStore.getState().setCurrentTopic(topicWithTwoItems);
    useAppStore.getState().soloItem("item-2");

    const [firstItem, secondItem] = useAppStore.getState().currentTopic!.items;
    expect(firstItem.muted).toBe(true);
    expect(firstItem.subItems[0].muted).toBe(true);
    expect(secondItem.muted).toBe(false);
    expect(secondItem.subItems[0].muted).toBe(false);
  });

  test("clicking solo again restores all items and subitems", () => {
    const topicWithSolo = {
      ...mockTopic,
      items: [
        { ...mockItem, id: "item-1", muted: true, subItems: [{ ...mockSubItem, id: "sub-1", itemId: "item-1", muted: true }] },
        { ...mockItem, id: "item-2", name: "Security", muted: false, subItems: [{ ...mockSubItem, id: "sub-2", itemId: "item-2", muted: false }] },
      ],
    };

    useAppStore.getState().setCurrentTopic(topicWithSolo);
    useAppStore.getState().soloItem("item-2");

    const items = useAppStore.getState().currentTopic!.items;
    expect(items.every((item) => !item.muted)).toBe(true);
    expect(items.every((item) => item.subItems.every((subItem) => !subItem.muted))).toBe(true);
  });
});

// ─── checkAchievements ────────────────────────────────────────────────────────

describe("checkAchievements", () => {
  beforeEach(() => {
    useAppStore.setState({
      achievements: useAppStore.getState().achievements.map((a) => ({ ...a, unlockedAt: null })),
      pendingAchievements: [],
      consecutiveCorrect: 0,
      consecutiveNoHint: 0,
      xp: 0,
      streak: 0,
      subItemStats: {},
    });
  });

  test("unlocks first_answer after first correct answer with totalCount >= 1", () => {
    useAppStore.setState({ subItemStats: { "sub-1": { correctCount: 1, totalCount: 1, difficulty: 1 } } });
    useAppStore.getState().checkAchievements({ correct: true });
    const a = useAppStore.getState().achievements.find((a) => a.id === "first_answer");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("adds unlocked achievement to pendingAchievements", () => {
    useAppStore.setState({ subItemStats: { "sub-1": { correctCount: 1, totalCount: 1, difficulty: 1 } } });
    useAppStore.getState().checkAchievements({ correct: true });
    expect(useAppStore.getState().pendingAchievements).toContain("first_answer");
  });

  test("does NOT re-unlock an already unlocked achievement", () => {
    const now = new Date().toISOString();
    useAppStore.setState({
      achievements: useAppStore.getState().achievements.map((a) =>
        a.id === "first_answer" ? { ...a, unlockedAt: now } : a
      ),
      subItemStats: { "sub-1": { correctCount: 2, totalCount: 2, difficulty: 1 } },
    });
    useAppStore.getState().checkAchievements({ correct: true });
    const pending = useAppStore.getState().pendingAchievements;
    expect(pending.filter((id) => id === "first_answer")).toHaveLength(0);
  });

  test("unlocks perfect_10 after 10 consecutive correct answers", () => {
    useAppStore.setState({ consecutiveCorrect: 9 });
    useAppStore.getState().checkAchievements({ correct: true });
    const a = useAppStore.getState().achievements.find((a) => a.id === "perfect_10");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("resets consecutiveCorrect to 0 on wrong answer", () => {
    useAppStore.setState({ consecutiveCorrect: 5 });
    useAppStore.getState().checkAchievements({ correct: false });
    expect(useAppStore.getState().consecutiveCorrect).toBe(0);
  });

  test("increments consecutiveCorrect on correct answer", () => {
    useAppStore.setState({ consecutiveCorrect: 3 });
    useAppStore.getState().checkAchievements({ correct: true });
    expect(useAppStore.getState().consecutiveCorrect).toBe(4);
  });

  test("unlocks xp_100 when xp >= 100", () => {
    useAppStore.setState({ xp: 100 });
    useAppStore.getState().checkAchievements({});
    const a = useAppStore.getState().achievements.find((a) => a.id === "xp_100");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("unlocks speed_demon on correct answer under 10s", () => {
    useAppStore.getState().checkAchievements({ correct: true, timeSpent: 8000 });
    const a = useAppStore.getState().achievements.find((a) => a.id === "speed_demon");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("does NOT unlock speed_demon if answer is wrong", () => {
    useAppStore.getState().checkAchievements({ correct: false, timeSpent: 5000 });
    const a = useAppStore.getState().achievements.find((a) => a.id === "speed_demon");
    expect(a?.unlockedAt).toBeNull();
  });

  test("does NOT unlock speed_demon if time > 10s", () => {
    useAppStore.getState().checkAchievements({ correct: true, timeSpent: 15000 });
    const a = useAppStore.getState().achievements.find((a) => a.id === "speed_demon");
    expect(a?.unlockedAt).toBeNull();
  });

  test("unlocks streak_7 when streak >= 7", () => {
    useAppStore.setState({ streak: 7 });
    useAppStore.getState().checkAchievements({});
    const a = useAppStore.getState().achievements.find((a) => a.id === "streak_7");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("unlocks topic_master when a subItem has 80%+ in 20+ questions", () => {
    useAppStore.setState({
      subItemStats: { "sub-1": { correctCount: 18, totalCount: 20, difficulty: 3 } },
    });
    useAppStore.getState().checkAchievements({});
    const a = useAppStore.getState().achievements.find((a) => a.id === "topic_master");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("resets consecutiveNoHint to 0 when hint is used", () => {
    useAppStore.setState({ consecutiveNoHint: 10 });
    useAppStore.getState().checkAchievements({ usedHint: true });
    expect(useAppStore.getState().consecutiveNoHint).toBe(0);
  });

  test("unlocks no_hints after 20 answers without hint", () => {
    useAppStore.setState({ consecutiveNoHint: 19 });
    useAppStore.getState().checkAchievements({ correct: true, usedHint: false });
    const a = useAppStore.getState().achievements.find((a) => a.id === "no_hints");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("unlocks boss_slayer when bossCompleted is true", () => {
    useAppStore.getState().checkAchievements({ bossCompleted: true });
    const a = useAppStore.getState().achievements.find((a) => a.id === "boss_slayer");
    expect(a?.unlockedAt).not.toBeNull();
  });

  test("adds boss_slayer to pendingAchievements when bossCompleted", () => {
    useAppStore.getState().checkAchievements({ bossCompleted: true });
    expect(useAppStore.getState().pendingAchievements).toContain("boss_slayer");
  });

  test("does NOT unlock boss_slayer when bossCompleted is false", () => {
    useAppStore.getState().checkAchievements({ bossCompleted: false });
    const a = useAppStore.getState().achievements.find((a) => a.id === "boss_slayer");
    expect(a?.unlockedAt).toBeNull();
  });

  test("does NOT unlock boss_slayer from a correct answer alone (no bossCompleted)", () => {
    useAppStore.getState().checkAchievements({ correct: true });
    const a = useAppStore.getState().achievements.find((a) => a.id === "boss_slayer");
    expect(a?.unlockedAt).toBeNull();
  });
});

// ─── dismissAchievement ───────────────────────────────────────────────────────

describe("dismissAchievement", () => {
  test("removes the achievement id from pendingAchievements", () => {
    useAppStore.setState({ pendingAchievements: ["first_answer", "xp_100"] });
    useAppStore.getState().dismissAchievement("first_answer");
    expect(useAppStore.getState().pendingAchievements).toEqual(["xp_100"]);
  });

  test("is a no-op when id is not in pending", () => {
    useAppStore.setState({ pendingAchievements: ["xp_100"] });
    useAppStore.getState().dismissAchievement("nonexistent");
    expect(useAppStore.getState().pendingAchievements).toEqual(["xp_100"]);
  });
});

// ─── saveSessionEntry ─────────────────────────────────────────────────────────

describe("saveSessionEntry", () => {
  beforeEach(() => {
    useAppStore.setState({ sessionHistory: [] });
  });

  test("saves a new entry", () => {
    useAppStore.getState().saveSessionEntry({ correctCount: 5, totalCount: 10, xpEarned: 50, topicId: "t1" });
    expect(useAppStore.getState().sessionHistory).toHaveLength(1);
    expect(useAppStore.getState().sessionHistory[0].correctCount).toBe(5);
  });

  test("sets date to today", () => {
    const today = new Date().toISOString().split("T")[0];
    useAppStore.getState().saveSessionEntry({ correctCount: 5, totalCount: 10, xpEarned: 50, topicId: "t1" });
    expect(useAppStore.getState().sessionHistory[0].date).toBe(today);
  });

  test("merges entry when same date and topicId already exist", () => {
    const today = new Date().toISOString().split("T")[0];
    useAppStore.setState({
      sessionHistory: [{ date: today, correctCount: 3, totalCount: 5, xpEarned: 30, topicId: "t1" }],
    });
    useAppStore.getState().saveSessionEntry({ correctCount: 2, totalCount: 5, xpEarned: 20, topicId: "t1" });
    const history = useAppStore.getState().sessionHistory;
    expect(history).toHaveLength(1);
    expect(history[0].correctCount).toBe(5);
    expect(history[0].totalCount).toBe(10);
    expect(history[0].xpEarned).toBe(50);
  });

  test("keeps different topicIds as separate entries on same day", () => {
    useAppStore.getState().saveSessionEntry({ correctCount: 5, totalCount: 10, xpEarned: 50, topicId: "t1" });
    useAppStore.getState().saveSessionEntry({ correctCount: 3, totalCount: 6, xpEarned: 30, topicId: "t2" });
    expect(useAppStore.getState().sessionHistory).toHaveLength(2);
  });

  test("caps history at 90 entries", () => {
    const old = Array.from({ length: 90 }, (_, i) => ({
      date: `2020-01-${String(i + 1).padStart(2, "0")}`,
      correctCount: 1, totalCount: 2, xpEarned: 10, topicId: "t1",
    }));
    useAppStore.setState({ sessionHistory: old });
    useAppStore.getState().saveSessionEntry({ correctCount: 1, totalCount: 2, xpEarned: 10, topicId: "t99" });
    expect(useAppStore.getState().sessionHistory).toHaveLength(90);
  });
});

// ─── toggleSubItemMute ────────────────────────────────────────────────────────

describe("toggleSubItemMute", () => {
  test("toggles subItem muted from false to true", () => {
    useAppStore.getState().setCurrentTopic(mockTopic);
    useAppStore.getState().toggleSubItemMute("sub-1");
    const sub = useAppStore.getState().currentTopic!.items[0].subItems[0];
    expect(sub.muted).toBe(true);
  });

  test("toggles subItem muted from true back to false", () => {
    const topicWithMutedSub = {
      ...mockTopic,
      items: [{ ...mockItem, subItems: [{ ...mockSubItem, muted: true }] }],
    };
    useAppStore.getState().setCurrentTopic(topicWithMutedSub);
    useAppStore.getState().toggleSubItemMute("sub-1");
    expect(useAppStore.getState().currentTopic!.items[0].subItems[0].muted).toBe(false);
  });

  test("does not affect other subItems", () => {
    const sub2 = { ...mockSubItem, id: "sub-2", name: "VMs in Azure" };
    const topicWithTwo = {
      ...mockTopic,
      items: [{ ...mockItem, subItems: [mockSubItem, sub2] }],
    };
    useAppStore.getState().setCurrentTopic(topicWithTwo);
    useAppStore.getState().toggleSubItemMute("sub-1");
    const subs = useAppStore.getState().currentTopic!.items[0].subItems;
    expect(subs[0].muted).toBe(true);
    expect(subs[1].muted).toBe(false);
  });
});

describe("soloSubItem", () => {
  test("keeps only the selected subitem active", () => {
    const topicWithTwoItems = {
      ...mockTopic,
      items: [
        {
          ...mockItem,
          id: "item-1",
          subItems: [
            { ...mockSubItem, id: "sub-1", itemId: "item-1", muted: false },
            { ...mockSubItem, id: "sub-2", itemId: "item-1", name: "PaaS", muted: false },
          ],
        },
        {
          ...mockItem,
          id: "item-2",
          name: "Security",
          subItems: [{ ...mockSubItem, id: "sub-3", itemId: "item-2", name: "IAM", muted: false }],
        },
      ],
    };

    useAppStore.getState().setCurrentTopic(topicWithTwoItems);
    useAppStore.getState().soloSubItem("sub-2");

    const [firstItem, secondItem] = useAppStore.getState().currentTopic!.items;
    expect(firstItem.muted).toBe(false);
    expect(firstItem.subItems[0].muted).toBe(true);
    expect(firstItem.subItems[1].muted).toBe(false);
    expect(secondItem.muted).toBe(true);
    expect(secondItem.subItems[0].muted).toBe(true);
  });

  test("clicking subitem solo again restores all items and subitems", () => {
    const topicWithSoloSubitem = {
      ...mockTopic,
      items: [
        {
          ...mockItem,
          id: "item-1",
          muted: false,
          subItems: [
            { ...mockSubItem, id: "sub-1", itemId: "item-1", muted: true },
            { ...mockSubItem, id: "sub-2", itemId: "item-1", muted: false },
          ],
        },
        {
          ...mockItem,
          id: "item-2",
          muted: true,
          subItems: [{ ...mockSubItem, id: "sub-3", itemId: "item-2", muted: true }],
        },
      ],
    };

    useAppStore.getState().setCurrentTopic(topicWithSoloSubitem);
    useAppStore.getState().soloSubItem("sub-2");

    const items = useAppStore.getState().currentTopic!.items;
    expect(items.every((item) => !item.muted)).toBe(true);
    expect(items.every((item) => item.subItems.every((subItem) => !subItem.muted))).toBe(true);
  });
});
