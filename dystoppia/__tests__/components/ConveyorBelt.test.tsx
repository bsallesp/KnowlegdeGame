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
    expect(screen.getByText("Now")).toBeInTheDocument();
  });

  test("renders 'Up next' label", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(screen.getByText("Up next")).toBeInTheDocument();
  });

  test("renders skeleton when no currentQuestion", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(screen.getByTestId("conveyor-skeleton")).toBeInTheDocument();
  });

  test("renders current question indicator when present", () => {
    const q = makeQuestion();
    render(<ConveyorBelt queue={[]} currentQuestion={q} isGenerating={false} />);
    expect(screen.getByTestId("conveyor-current-indicator")).toBeInTheDocument();
  });

  test("renders queue cards for each queued question", () => {
    const queue = [
      makeQuestion({ id: "q-2", type: "multiple_choice" }),
      makeQuestion({ id: "q-3", type: "true_false" }),
      makeQuestion({ id: "q-4", type: "fill_blank" }),
    ];
    render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={false} />);
    // MC=MC, TF, FB labels
    expect(screen.getByText("MC")).toBeInTheDocument();
    expect(screen.getByText("TF")).toBeInTheDocument();
    expect(screen.getByText("FB")).toBeInTheDocument();
  });

  test("renders 'SC' label for single_choice questions", () => {
    const queue = [makeQuestion({ id: "q-5", type: "single_choice" })];
    render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={false} />);
    expect(screen.getByText("SC")).toBeInTheDocument();
  });

  test("renders 'Generating...' when isGenerating = true", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={true} />);
    expect(screen.getByTestId("conveyor-generating")).toBeInTheDocument();
    expect(screen.getAllByTestId("conveyor-generating-dot")).toHaveLength(3);
  });

  test("does not render generating text when isGenerating = false", () => {
    render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(screen.queryByText("Generating...")).toBeNull();
  });

  test("renders empty queue without crash", () => {
    const { container } = render(<ConveyorBelt queue={[]} currentQuestion={null} isGenerating={false} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  test("shows subItem name as title tooltip on queue card", () => {
    const q = makeQuestion({
      subItem: { id: "sub-1", itemId: "item-1", name: "IaaS vs PaaS", order: 0, muted: false, difficulty: 1 },
    });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    const [card] = screen.getAllByTestId("conveyor-queue-card");
    expect(card).toHaveAttribute("title", "IaaS vs PaaS");
  });

  test("falls back to 'Question' title when subItem is missing", () => {
    const q = makeQuestion({ subItem: undefined });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    const [card] = screen.getAllByTestId("conveyor-queue-card");
    expect(card).toHaveAttribute("title", "Question");
  });

  test("renders difficulty bar proportional to difficulty level", () => {
    const q = makeQuestion({ difficulty: 4 });
    render(<ConveyorBelt queue={[q]} currentQuestion={null} isGenerating={false} />);
    const [bar] = screen.getAllByTestId("conveyor-difficulty-fill");
    expect(bar).toHaveStyle({ width: "80%" });
  });

  test("multiple questions in queue all get unique cards", () => {
    const queue = Array.from({ length: 5 }, (_, i) =>
      makeQuestion({ id: `q-${i}`, type: "multiple_choice" })
    );
    render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={false} />);
    const labels = screen.getAllByText("MC");
    expect(labels).toHaveLength(5);
  });

  test("renders component with both currentQuestion and queue", () => {
    const current = makeQuestion({ id: "current" });
    const queue = [makeQuestion({ id: "next-1" }), makeQuestion({ id: "next-2" })];
    render(<ConveyorBelt queue={queue} currentQuestion={current} isGenerating={false} />);
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getAllByText("MC")).toHaveLength(2);
  });

  test("shows both generating and queue questions simultaneously", () => {
    const queue = [makeQuestion({ id: "q-extra" })];
    render(<ConveyorBelt queue={queue} currentQuestion={null} isGenerating={true} />);
    expect(screen.getByText("MC")).toBeInTheDocument();
    expect(screen.getAllByTestId("conveyor-generating-dot")).toHaveLength(3);
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
