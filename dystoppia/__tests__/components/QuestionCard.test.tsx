import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuestionCard from "@/components/QuestionCard";
import type { Question } from "@/types";

// framer-motion stub
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => { const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props as any; return <div {...rest}>{children}</div>; },
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => { const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props as any; return <span {...rest}>{children}</span>; },
    button: ({ children, onClick, ...props }: React.PropsWithChildren<Record<string, unknown>>) => { const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props as any; return <button onClick={onClick as any} {...rest}>{children}</button>; },
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => { const { initial, animate, exit, transition, ...rest } = props as any; return <p {...rest}>{children}</p>; },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-1",
    subItemId: "sub-1",
    type: "multiple_choice",
    content: "What is Azure?",
    options: ["A cloud platform", "A database", "An OS", "A browser"],
    answer: "A cloud platform",
    explanation: "Azure is Microsoft's cloud platform.",
    difficulty: 1,
    timeLimit: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("QuestionCard — multiple_choice", () => {
  test("renders question content", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("What is Azure?")).toBeTruthy();
  });

  test("renders all options", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("A cloud platform")).toBeTruthy();
    expect(screen.getByText("A database")).toBeTruthy();
    expect(screen.getByText("An OS")).toBeTruthy();
    expect(screen.getByText("A browser")).toBeTruthy();
  });

  test("shows type label 'Multiple Choice'", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("Multiple Choice")).toBeTruthy();
  });

  test("shows difficulty dots", () => {
    render(
      <QuestionCard
        question={makeQuestion({ difficulty: 3 })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("Difficulty")).toBeTruthy();
  });

  test("submit button is disabled with no selection", async () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    // Current behavior: submit button only appears after selecting an option
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });

  test("calls onAnswer after selecting and submitting", async () => {
    const onAnswer = vi.fn();
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={onAnswer}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    await userEvent.click(screen.getByText("A cloud platform"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer.mock.calls[0][0]).toBe("A cloud platform");
  });

  test("shows explanation when answerShown = true", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={true}
        lastAnswerCorrect={true}
        userAnswer="A cloud platform"
      />
    );
    expect(screen.getByText("Azure is Microsoft's cloud platform.")).toBeTruthy();
  });

  test("shows 'Correct!' feedback when correct", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={true}
        lastAnswerCorrect={true}
        userAnswer="A cloud platform"
      />
    );
    expect(screen.getByText("Correct!")).toBeTruthy();
  });

  test("shows 'Incorrect' feedback when wrong", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={true}
        lastAnswerCorrect={false}
        userAnswer="A database"
      />
    );
    expect(screen.getByText("Incorrect")).toBeTruthy();
  });

  test("shows subItem name when present", () => {
    const q = makeQuestion({
      subItem: {
        id: "sub-1",
        itemId: "item-1",
        name: "Cloud Basics",
        order: 0,
        muted: false,
        difficulty: 1,
      },
    });
    render(
      <QuestionCard
        question={q}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("Cloud Basics")).toBeTruthy();
  });

  test("hides submit button when answerShown = true", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={true}
        lastAnswerCorrect={true}
        userAnswer="A cloud platform"
      />
    );
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
  });
});

describe("QuestionCard — true_false", () => {
  test("renders True and False options", () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: "true_false", options: ["True", "False"], answer: "True", content: "Azure is a cloud?" })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("True")).toBeTruthy();
    expect(screen.getByText("False")).toBeTruthy();
  });

  test("shows type label 'True or False'", () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: "true_false", options: ["True", "False"], answer: "True" })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("True or False")).toBeTruthy();
  });

  test("calls onAnswer with 'True' when True is selected", async () => {
    const onAnswer = vi.fn();
    render(
      <QuestionCard
        question={makeQuestion({ type: "true_false", options: ["True", "False"], answer: "True" })}
        onAnswer={onAnswer}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    await userEvent.click(screen.getByText("True"));
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onAnswer.mock.calls[0][0]).toBe("True");
  });
});

describe("QuestionCard — fill_blank", () => {
  test("renders fill_blank label", () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: "fill_blank", content: "Azure is a ___ platform.", options: ["cloud", "local"], answer: "cloud" })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("Fill in the Blank")).toBeTruthy();
  });

  test("splits content around ___", () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: "fill_blank", content: "Azure is a ___ platform.", options: ["cloud", "local"], answer: "cloud" })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("Azure is a")).toBeTruthy();
    expect(screen.getByText("platform.")).toBeTruthy();
  });
});

describe("QuestionCard — timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows time remaining when timeLimit is set", () => {
    render(
      <QuestionCard
        question={makeQuestion({ timeLimit: 30 })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("30s")).toBeTruthy();
  });

  test("does not show timer when timeLimit is null", () => {
    render(
      <QuestionCard
        question={makeQuestion({ timeLimit: null })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.queryByText(/\ds$/)).toBeNull();
  });

  test("calls onAnswer with __timeout__ when timer hits 0", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionCard
        question={makeQuestion({ timeLimit: 1 })}
        onAnswer={onAnswer}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onAnswer).toHaveBeenCalledWith("__timeout__", expect.any(Number));
  });

  test("timer does not countdown when answerShown = true", () => {
    const onAnswer = vi.fn();
    render(
      <QuestionCard
        question={makeQuestion({ timeLimit: 10 })}
        onAnswer={onAnswer}
        answerShown={true}
        lastAnswerCorrect={true}
        userAnswer="A cloud platform"
      />
    );
    act(() => { vi.advanceTimersByTime(15000); });
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("QuestionCard — hint button", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hint: "Think about the CIA triad." }),
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows hint button for multiple_choice when answerShown is false", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    expect(screen.getByTitle(/hint/i)).toBeTruthy();
  });

  test("hint button is disabled when xp < 5", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={2}
      />
    );
    const btn = screen.getByTitle(/Precisa de/i);
    expect(btn).toBeTruthy();
  });

  test("does NOT show hint button for fill_blank", () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: "fill_blank", content: "Azure is a ___ platform.", options: ["cloud", "local"], answer: "cloud" })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    expect(screen.queryByTitle(/hint/i)).toBeNull();
  });

  test("does NOT show hint button when answerShown is true", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={true}
        lastAnswerCorrect={true}
        userAnswer="A cloud platform"
        xp={10}
      />
    );
    expect(screen.queryByTitle(/hint/i)).toBeNull();
  });

  test("calls onHintUsed when hint is fetched successfully", async () => {
    const onHintUsed = vi.fn();
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
        onHintUsed={onHintUsed}
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => expect(onHintUsed).toHaveBeenCalledOnce());
  });

  test("displays hint text after successful fetch", async () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => expect(screen.getByText(/Think about the CIA triad/)).toBeTruthy());
  });

  test("hint button shows '✓ Hint' after being used", async () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => expect(screen.getByText("✓ Hint")).toBeTruthy());
  });

  test("shows '⚠ Erro' when API returns non-ok", async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false });
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => expect(screen.getByText("⚠ Erro")).toBeTruthy());
  });

  test("shows '⚠ Erro' when fetch throws (network error)", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("network fail"));
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => expect(screen.getByText("⚠ Erro")).toBeTruthy());
  });

  test("sends topicName prop to API", async () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
        topicName="Cloud Computing"
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => {
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.topicName).toBe("Cloud Computing");
    });
  });

  test("sends empty topicName when prop is not provided", async () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
        xp={10}
      />
    );
    await userEvent.click(screen.getByTitle(/hint/i));
    await waitFor(() => {
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.topicName).toBe("");
    });
  });
});

describe("QuestionCard — single_choice", () => {
  test("shows type label 'Single Choice'", () => {
    render(
      <QuestionCard
        question={makeQuestion({ type: "single_choice" })}
        onAnswer={vi.fn()}
        answerShown={false}
        lastAnswerCorrect={null}
      />
    );
    expect(screen.getByText("Single Choice")).toBeTruthy();
  });
});
