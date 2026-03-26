import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TopicDashboard from "@/components/TopicDashboard";
import type { Item } from "@/types";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    span: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    topicId: "topic-1",
    name: "Cloud Concepts",
    order: 0,
    muted: false,
    subItems: [
      { id: "sub-1", itemId: "item-1", name: "IaaS vs PaaS", order: 0, muted: false, difficulty: 1 },
      { id: "sub-2", itemId: "item-1", name: "SaaS overview", order: 1, muted: false, difficulty: 2 },
    ],
    ...overrides,
  };
}

const emptyStats = {};
const stats = {
  "sub-1": { correctCount: 3, totalCount: 5, difficulty: 2 },
  "sub-2": { correctCount: 1, totalCount: 4, difficulty: 1 },
};

describe("TopicDashboard — rendering", () => {
  test("renders item name", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByText("Cloud Concepts")).toBeInTheDocument();
  });

  test("renders subitem names", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByText("IaaS vs PaaS")).toBeInTheDocument();
    expect(screen.getByText("SaaS overview")).toBeInTheDocument();
  });

  test("renders multiple items", () => {
    const items = [
      makeItem({ id: "item-1", name: "Cloud Concepts" }),
      makeItem({ id: "item-2", name: "Security", subItems: [{ id: "sub-3", itemId: "item-2", name: "IAM", order: 0, muted: false, difficulty: 1 }] }),
    ];
    render(<TopicDashboard items={items} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByText("Cloud Concepts")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("IAM")).toBeInTheDocument();
  });

  test("renders empty items list without crash", () => {
    const { container } = render(<TopicDashboard items={[]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  test("renders mute button for item", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByLabelText("Mute item")).toBeInTheDocument();
  });

  test("renders mute buttons for subitems", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    const muteButtons = screen.getAllByLabelText(/mute subitem/i);
    expect(muteButtons.length).toBe(2);
  });

  test("shows Unmute label when item is muted", () => {
    render(<TopicDashboard items={[makeItem({ muted: true })]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByLabelText("Unmute item")).toBeInTheDocument();
  });

  test("renders progress bar when stats have data", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={stats} onToggleMute={vi.fn()} />);
    const bars = screen.getAllByTestId("topic-progress-bar");
    expect(bars.length).toBeGreaterThan(0);
  });

  test("displays totalCount = 0 for subitems with no stats", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.queryByTestId("topic-progress-bar")).toBeNull();
  });
});

describe("TopicDashboard — interactions", () => {
  test("calls onToggleMute with item id and 'item' type", async () => {
    const onToggleMute = vi.fn();
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={onToggleMute} />);
    await userEvent.click(screen.getByLabelText("Mute item"));
    expect(onToggleMute).toHaveBeenCalledWith("item-1", "item");
  });

  test("calls onToggleMute with subitem id and 'subitem' type", async () => {
    const onToggleMute = vi.fn();
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={onToggleMute} />);
    const buttons = screen.getAllByLabelText(/mute subitem/i);
    await userEvent.click(buttons[0]);
    expect(onToggleMute).toHaveBeenCalledWith("sub-1", "subitem");
  });

  test("collapses item when toggle button is clicked", async () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    // Initially subitems are visible
    expect(screen.getByText("IaaS vs PaaS")).toBeTruthy();
    // Click the collapse toggle (first button inside item header)
    const collapseBtn = screen.getByRole("button", { name: /cloud concepts/i });
    await userEvent.click(collapseBtn);
    expect(screen.queryByText("IaaS vs PaaS")).toBeNull();
  });

  test("re-expands item when toggle is clicked twice", async () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    const collapseBtn = screen.getByRole("button", { name: /cloud concepts/i });
    await userEvent.click(collapseBtn);
    await userEvent.click(collapseBtn);
    expect(screen.getByText("IaaS vs PaaS")).toBeInTheDocument();
  });

  test("muted item has reduced opacity", () => {
    render(<TopicDashboard items={[makeItem({ muted: true })]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    // "Cloud Concepts" is inside <span> inside <button> inside the flex div that has opacity: 0.5
    const itemHeader = screen.getByText("Cloud Concepts").closest("div") as HTMLElement;
    // The opacity style is directly on the itemHeader div (the flex container)
    expect(itemHeader?.getAttribute("style") ?? "").toContain("opacity: 0.5");
  });

  test("muted subitem shows Unmute label", () => {
    const item = makeItem({
      subItems: [{ id: "sub-1", itemId: "item-1", name: "IaaS vs PaaS", order: 0, muted: true, difficulty: 1 }],
    });
    render(<TopicDashboard items={[item]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByLabelText("Unmute subitem")).toBeInTheDocument();
  });
});

describe("TopicDashboard — onOpenAudiobooks", () => {
  test("renders headphone button for item when onOpenAudiobooks is provided", () => {
    render(
      <TopicDashboard
        items={[makeItem()]}
        subItemStats={emptyStats}
        onToggleMute={vi.fn()}
        onOpenAudiobooks={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Abrir audiobooks do item")).toBeInTheDocument();
  });

  test("renders headphone buttons for subitems when onOpenAudiobooks is provided", () => {
    render(
      <TopicDashboard
        items={[makeItem()]}
        subItemStats={emptyStats}
        onToggleMute={vi.fn()}
        onOpenAudiobooks={vi.fn()}
      />
    );
    const btns = screen.getAllByLabelText("Abrir audiobooks do subitem");
    expect(btns.length).toBe(2);
  });

  test("does NOT render headphone buttons when onOpenAudiobooks is undefined", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.queryByLabelText("Abrir audiobooks do item")).toBeNull();
    expect(screen.queryByLabelText("Abrir audiobooks do subitem")).toBeNull();
  });

  test("calls onOpenAudiobooks with item id, 'item', and item name", async () => {
    const onOpenAudiobooks = vi.fn();
    render(
      <TopicDashboard
        items={[makeItem()]}
        subItemStats={emptyStats}
        onToggleMute={vi.fn()}
        onOpenAudiobooks={onOpenAudiobooks}
      />
    );
    await userEvent.click(screen.getByLabelText("Abrir audiobooks do item"));
    expect(onOpenAudiobooks).toHaveBeenCalledWith("item-1", "item", "Cloud Concepts");
  });

  test("calls onOpenAudiobooks with subitem id, 'subitem', and subitem name", async () => {
    const onOpenAudiobooks = vi.fn();
    render(
      <TopicDashboard
        items={[makeItem()]}
        subItemStats={emptyStats}
        onToggleMute={vi.fn()}
        onOpenAudiobooks={onOpenAudiobooks}
      />
    );
    const btns = screen.getAllByLabelText("Abrir audiobooks do subitem");
    await userEvent.click(btns[0]);
    expect(onOpenAudiobooks).toHaveBeenCalledWith("sub-1", "subitem", "IaaS vs PaaS");
  });
});

describe("TopicDashboard — stats display", () => {
  test("progress bar title shows correct/total", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={stats} onToggleMute={vi.fn()} />);
    const [firstBar] = screen.getAllByTestId("topic-progress-bar");
    expect(firstBar).toHaveAttribute("title", "3/5 correct");
  });

  test("renders difficulty dots for each subitem", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={stats} onToggleMute={vi.fn()} />);
    const dots = screen.getAllByTestId("topic-difficulty-dot");
    expect(dots.length).toBeGreaterThanOrEqual(10);
  });

  test("does not crash when stats have unknown subitem ids", () => {
    render(
      <TopicDashboard
        items={[makeItem()]}
        subItemStats={{ "unknown-id": { correctCount: 2, totalCount: 3, difficulty: 1 } }}
        onToggleMute={vi.fn()}
      />
    );
    expect(screen.getByText("IaaS vs PaaS")).toBeInTheDocument();
  });
});
