import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// ─── Framer-motion stub ───────────────────────────────────────────────────────
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <div {...rest}>{children}</div>;
    },
    button: ({ children, onClick, disabled, ...p }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p as any;
      return <button onClick={onClick as any} disabled={disabled as any} {...rest}>{children}</button>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import TopicApprovalScreen from "@/components/TopicApprovalScreen";
import type { Topic } from "@/types";

const makeTopic = (overrides?: Partial<Topic>): Topic => ({
  id: "topic-1",
  name: "React Fundamentals",
  slug: "react-fundamentals",
  createdAt: new Date().toISOString(),
  teachingProfile: null,
  items: [
    {
      id: "item-1",
      topicId: "topic-1",
      name: "JSX & Components",
      order: 0,
      muted: false,
      subItems: [
        { id: "sub-1", itemId: "item-1", name: "JSX syntax", order: 0, muted: false, difficulty: 1 },
        { id: "sub-2", itemId: "item-1", name: "Props", order: 1, muted: false, difficulty: 1 },
      ],
    },
    {
      id: "item-2",
      topicId: "topic-1",
      name: "Hooks",
      order: 1,
      muted: false,
      subItems: [
        { id: "sub-3", itemId: "item-2", name: "useState", order: 0, muted: false, difficulty: 1 },
        { id: "sub-4", itemId: "item-2", name: "useEffect", order: 1, muted: false, difficulty: 1 },
      ],
    },
    {
      id: "item-3",
      topicId: "topic-1",
      name: "State Management",
      order: 2,
      muted: false,
      subItems: [
        { id: "sub-5", itemId: "item-3", name: "Context API", order: 0, muted: false, difficulty: 1 },
      ],
    },
  ],
  ...overrides,
});

// ─── Header & layout ─────────────────────────────────────────────────────────

describe("TopicApprovalScreen — header", () => {
  test("shows topic name in header badge", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    expect(screen.getByText("React Fundamentals")).toBeTruthy();
  });

  test("shows 'Review your learning plan' label", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    expect(screen.getByText("Review your learning plan")).toBeTruthy();
  });

  test("shows personalized plan heading", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/personalized plan/i)).toBeTruthy();
  });
});

// ─── Item rendering ───────────────────────────────────────────────────────────

describe("TopicApprovalScreen — item rendering", () => {
  test("renders all item names", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    expect(screen.getByText("JSX & Components")).toBeTruthy();
    expect(screen.getByText("Hooks")).toBeTruthy();
    expect(screen.getByText("State Management")).toBeTruthy();
  });

  test("renders sub-item names as tags", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    expect(screen.getByText("JSX syntax")).toBeTruthy();
    expect(screen.getByText("useState")).toBeTruthy();
    expect(screen.getByText("Context API")).toBeTruthy();
  });

  test("shows all items selected by default", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    expect(screen.getByText("3 of 3 topics selected")).toBeTruthy();
  });
});

// ─── Toggle behavior ──────────────────────────────────────────────────────────

describe("TopicApprovalScreen — toggling items", () => {
  test("clicking an item reduces selected count", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("Hooks"));
    expect(screen.getByText("2 of 3 topics selected")).toBeTruthy();
  });

  test("clicking a disabled item re-enables it", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("Hooks"));
    expect(screen.getByText("2 of 3 topics selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Hooks"));
    expect(screen.getByText("3 of 3 topics selected")).toBeTruthy();
  });

  test("can disable multiple items", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("JSX & Components"));
    fireEvent.click(screen.getByText("Hooks"));
    expect(screen.getByText("1 of 3 topics selected")).toBeTruthy();
  });

  test("can disable all items (count reaches 0)", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("JSX & Components"));
    fireEvent.click(screen.getByText("Hooks"));
    fireEvent.click(screen.getByText("State Management"));
    expect(screen.getByText("0 of 3 topics selected")).toBeTruthy();
  });
});

// ─── Start Learning button ────────────────────────────────────────────────────

describe("TopicApprovalScreen — Start Learning button", () => {
  test("button is enabled when at least one item is selected", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    const btn = screen.getByText("Start Learning →").closest("button");
    expect(btn?.disabled).toBe(false);
  });

  test("button is disabled when all items are deselected", () => {
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("JSX & Components"));
    fireEvent.click(screen.getByText("Hooks"));
    fireEvent.click(screen.getByText("State Management"));
    const btn = screen.getByText("Start Learning →").closest("button");
    expect(btn?.disabled).toBe(true);
  });

  test("calls onConfirm with empty set when all items are kept", () => {
    const onConfirm = vi.fn();
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Start Learning →"));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [disabledSet] = onConfirm.mock.calls[0] as [Set<string>];
    expect(disabledSet.size).toBe(0);
  });

  test("calls onConfirm with the disabled item id", () => {
    const onConfirm = vi.fn();
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Hooks"));
    fireEvent.click(screen.getByText("Start Learning →"));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [disabledSet] = onConfirm.mock.calls[0] as [Set<string>];
    expect(disabledSet.has("item-2")).toBe(true);
    expect(disabledSet.size).toBe(1);
  });

  test("calls onConfirm with multiple disabled ids", () => {
    const onConfirm = vi.fn();
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("JSX & Components"));
    fireEvent.click(screen.getByText("Hooks"));
    fireEvent.click(screen.getByText("Start Learning →"));
    const [disabledSet] = onConfirm.mock.calls[0] as [Set<string>];
    expect(disabledSet.has("item-1")).toBe(true);
    expect(disabledSet.has("item-2")).toBe(true);
    expect(disabledSet.size).toBe(2);
  });

  test("does not call onConfirm when button is disabled (all deselected)", () => {
    const onConfirm = vi.fn();
    render(<TopicApprovalScreen topic={makeTopic()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("JSX & Components"));
    fireEvent.click(screen.getByText("Hooks"));
    fireEvent.click(screen.getByText("State Management"));
    fireEvent.click(screen.getByText("Start Learning →"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("TopicApprovalScreen — edge cases", () => {
  test("renders correctly with a single item", () => {
    const topic = makeTopic({
      items: [
        {
          id: "item-1",
          topicId: "topic-1",
          name: "Only Item",
          order: 0,
          muted: false,
          subItems: [],
        },
      ],
    });
    render(<TopicApprovalScreen topic={topic} onConfirm={vi.fn()} />);
    expect(screen.getByText("Only Item")).toBeTruthy();
    expect(screen.getByText("1 of 1 topics selected")).toBeTruthy();
  });

  test("renders correctly with items that have no sub-items", () => {
    const topic = makeTopic({
      items: [
        { id: "item-1", topicId: "topic-1", name: "Empty Item", order: 0, muted: false, subItems: [] },
      ],
    });
    render(<TopicApprovalScreen topic={topic} onConfirm={vi.fn()} />);
    expect(screen.getByText("Empty Item")).toBeTruthy();
  });
});
