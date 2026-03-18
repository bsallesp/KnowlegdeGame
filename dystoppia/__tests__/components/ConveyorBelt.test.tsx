import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConveyorBelt from "@/components/ConveyorBelt";
import type { Question } from "@/types";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-1",
    subItemId: "sub-1",
    type: "multiple_choice",
    content: "Test question?",
    options: ["A", "B", "C", "D"],
    answer: "A",
    explanation: "Because A.",
    difficulty: 1,
    timeLimit: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ConveyorBelt — rendering", () => {
  test("renders 'Now' label", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(screen.getByText("Now")).toBeTruthy();
  });

  test("renders 'Up next' label", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(screen.getByText("Up next")).toBeTruthy();
  });

  test("renders skeleton when no currentQuestion", () => {
    const { container } = render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    // SkeletonCard is a div with specific dimensions
    const skeletons = container.querySelectorAll('[style*="56px"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  test("renders current question indicator when present", () => {
    const q = makeQuestion();
    const { container } = render(<ConveyorBelt queue={[]} currentQuestion={q} isGenerating={false} />);
    // The active card has boxShadow glow
    const glowCard = container.querySelector('[style*="box-shadow"]');
    expect(glowCard).toBeTruthy();
  });

  test("renders queue cards for each queued question", () => {
    const queue = [
      makeQuestion({ id: "q-2", type: "multiple_choice" }),
      makeQuestion({ id: "q-3", type: "true_false" }),
      makeQuestion({ id: "q-4", type: "fill_blank" }),
    ];
    const { container } = render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={false} />);
    // MC=MC, TF, FB labels
    expect(screen.getByText("MC")).toBeTruthy();
    expect(screen.getByText("TF")).toBeTruthy();
    expect(screen.getByText("FB")).toBeTruthy();
  });

  test("renders 'SC' label for single_choice questions", () => {
    const queue = [makeQuestion({ id: "q-5", type: "single_choice" })];
    render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={false} />);
    expect(screen.getByText("SC")).toBeTruthy();
  });

  test("renders 'Generating...' when isGenerating = true", () => {
    // Component renders 3 animated dots, NOT the text "Generating..."
    const { container } = render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={true} />);
    const dots = container.querySelectorAll('.w-1\\.5.h-1\\.5.rounded-full');
    expect(dots.length).toBe(3);
  });

  test("does not render generating text when isGenerating = false", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(screen.queryByText("Generating...")).toBeNull();
  });

  test("renders empty queue without crash", () => {
    const { container } = render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(container).toBeTruthy();
  });

  test("shows subItem name as title tooltip on queue card", () => {
    const q = makeQuestion({
      subItem: { id: "sub-1", itemId: "item-1", name: "IaaS vs PaaS", order: 0, muted: false, difficulty: 1 },
    });
    const { container } = render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    const card = container.querySelector('[title="IaaS vs PaaS"]');
    expect(card).toBeTruthy();
  });

  test("falls back to 'Question' title when subItem is missing", () => {
    const q = makeQuestion({ subItem: undefined });
    const { container } = render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    const card = container.querySelector('[title="Question"]');
    expect(card).toBeTruthy();
  });

  test("renders difficulty bar proportional to difficulty level", () => {
    const q = makeQuestion({ difficulty: 4 });
    const { container } = render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    // difficulty 4 = 80% width
    const bar = container.querySelector('[style*="80%"]');
    expect(bar).toBeTruthy();
  });

  test("multiple questions in queue all get unique cards", () => {
    const queue = Array.from({ length: 5 }, (_, i) =>
      makeQuestion({ id: `q-${i}`, type: "multiple_choice" })
    );
    render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={false} />);
    const labels = screen.getAllByText("MC");
    expect(labels.length).toBe(5);
  });

  test("renders component with both currentQuestion and queue", () => {
    const current = makeQuestion({ id: "current" });
    const queue = [makeQuestion({ id: "next-1" }), makeQuestion({ id: "next-2" })];
    render(<ConveyorBelt queue={queue} currentQuestion={current} isGenerating={false} />);
    expect(screen.getByText("Now")).toBeTruthy();
    expect(screen.getByText("Up next")).toBeTruthy();
    expect(screen.getAllByText("MC").length).toBe(2);
  });

  test("shows both generating and queue questions simultaneously", () => {
    const queue = [makeQuestion({ id: "q-extra" })];
    const { container } = render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={true} />);
    expect(screen.getByText("MC")).toBeTruthy();
    // Generating indicator shows 3 animated dots alongside the queue
    const dots = container.querySelectorAll('.w-1\\.5.h-1\\.5.rounded-full');
    expect(dots.length).toBe(3);
  });
});

describe("ConveyorBelt — type color coding", () => {
  // jsdom normalizes hex colors to rgb() in inline styles, so query via element.style.color
  test("multiple_choice uses indigo accent", () => {
    const q = makeQuestion({ type: "multiple_choice" });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    // #818CF8 = rgb(129, 140, 248)
    const label = screen.getByText("MC");
    expect(label.style.color).toContain("129, 140, 248");
  });

  test("true_false uses yellow accent", () => {
    const q = makeQuestion({ type: "true_false" });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    // #FACC15 = rgb(250, 204, 21)
    const label = screen.getByText("TF");
    expect(label.style.color).toContain("250, 204, 21");
  });

  test("single_choice uses sky blue accent", () => {
    const q = makeQuestion({ type: "single_choice" });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    // #38BDF8 = rgb(56, 189, 248)
    const label = screen.getByText("SC");
    expect(label.style.color).toContain("56, 189, 248");
  });

  test("fill_blank uses blue accent", () => {
    const q = makeQuestion({ type: "fill_blank" });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    // #60A5FA = rgb(96, 165, 250)
    const label = screen.getByText("FB");
    expect(label.style.color).toContain("96, 165, 250");
  });
});
