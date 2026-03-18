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
    expect(screen.getByText("Cloud Concepts")).toBeTruthy();
  });

  test("renders subitem names", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByText("IaaS vs PaaS")).toBeTruthy();
    expect(screen.getByText("SaaS overview")).toBeTruthy();
  });

  test("renders multiple items", () => {
    const items = [
      makeItem({ id: "item-1", name: "Cloud Concepts" }),
      makeItem({ id: "item-2", name: "Security", subItems: [{ id: "sub-3", itemId: "item-2", name: "IAM", order: 0, muted: false, difficulty: 1 }] }),
    ];
    render(<TopicDashboard items={items} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByText("Cloud Concepts")).toBeTruthy();
    expect(screen.getByText("Security")).toBeTruthy();
    expect(screen.getByText("IAM")).toBeTruthy();
  });

  test("renders empty items list without crash", () => {
    const { container } = render(<TopicDashboard items={[]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(container.firstChild).toBeTruthy();
  });

  test("renders mute button for item", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByLabelText("Mute item")).toBeTruthy();
  });

  test("renders mute buttons for subitems", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    const muteButtons = screen.getAllByLabelText(/mute subitem/i);
    expect(muteButtons.length).toBe(2);
  });

  test("shows Unmute label when item is muted", () => {
    render(<TopicDashboard items={[makeItem({ muted: true })]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    expect(screen.getByLabelText("Unmute item")).toBeTruthy();
  });

  test("renders progress bar when stats have data", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={stats} onToggleMute={vi.fn()} />);
    // progress bars are divs with title containing correct/total
    const bars = document.querySelectorAll('[title*="/"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  test("displays totalCount = 0 for subitems with no stats", () => {
    // ProgressBar only renders when totalCount > 0, so with empty stats no bars appear
    render(<TopicDashboard items={[makeItem()]} subItemStats={emptyStats} onToggleMute={vi.fn()} />);
    const bars = document.querySelectorAll('[title*=" correct"]');
    expect(bars.length).toBe(0);
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
    expect(screen.getByText("IaaS vs PaaS")).toBeTruthy();
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
    expect(screen.getByLabelText("Unmute subitem")).toBeTruthy();
  });
});

describe("TopicDashboard — stats display", () => {
  test("progress bar title shows correct/total", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={stats} onToggleMute={vi.fn()} />);
    expect(document.querySelector('[title="3/5 correct"]')).toBeTruthy();
  });

  test("renders difficulty dots for each subitem", () => {
    render(<TopicDashboard items={[makeItem()]} subItemStats={stats} onToggleMute={vi.fn()} />);
    // 5 difficulty dots per subitem, 2 subitems = 10 dots
    const dots = document.querySelectorAll(".w-1\\.5.h-1\\.5.rounded-full");
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
    expect(screen.getByText("IaaS vs PaaS")).toBeTruthy();
  });
});
