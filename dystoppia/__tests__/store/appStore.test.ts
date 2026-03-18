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
    expect(settings.refillTrigger).toBe(2); // unchanged default
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
