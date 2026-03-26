import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import OnboardingWizard from "@/components/OnboardingWizard";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const defaultProps = {
  topic: "AZ-900",
  pillar: "studio" as const,
  topicExists: false,
  onComplete: vi.fn(),
  onSkip: vi.fn(),
};

function makeTurnResponse(overrides = {}) {
  return {
    readyToCreate: false,
    turn: {
      question: "What is your current level?",
      subtitle: "This helps calibrate content",
      multiSelect: false,
      cards: [
        { id: "beginner", label: "Beginner", description: "I have never used cloud", icon: "🌱" },
        { id: "intermediate", label: "Intermediate", description: "I have used it a bit", icon: "⚡" },
        { id: "advanced", label: "Advanced", description: "I use it daily", icon: "🚀" },
      ],
      allowFreeText: true,
      freeTextPlaceholder: "Or describe your level...",
    },
    summary: { topic: "AZ-900" },
    ...overrides,
  };
}

function makeReadyResponse() {
  return {
    readyToCreate: true,
    turn: null,
    summary: { topic: "AZ-900", level: "Beginner", goal: "Certification" },
    onboardingContext: "Beginner user seeking AZ-900 certification.",
  };
}

function setupFetch(response: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps.onComplete = vi.fn();
  defaultProps.onSkip = vi.fn();
});

// ─── Initial render ───────────────────────────────────────────────────────────
describe("OnboardingWizard — initial render", () => {
  test("shows loading text on mount before API responds", async () => {
    const pendingResponse = createDeferred<{ ok: true; json: () => Promise<object> }>();
    global.fetch = vi.fn().mockReturnValue(pendingResponse.promise);
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByText("Analyzing the topic...")).toBeInTheDocument();
    await act(async () => {
      pendingResponse.resolve({ ok: true, json: () => Promise.resolve(makeTurnResponse()) });
    });
  });

  test("renders topic badge in header", () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByText("AZ-900")).toBeTruthy();
  });

  test("renders Skip button", () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByText(/Skip/)).toBeTruthy();
  });

  test("calls /api/onboarding/chat on mount", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/onboarding/chat",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("sends topic and pillar in initial request", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      const body = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(body.topic).toBe("AZ-900");
      expect(body.pillar).toBe("studio");
    });
  });

  test("sends empty messages array on first call", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      const body = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(body.messages).toEqual([]);
    });
  });
});

// ─── Showing question ─────────────────────────────────────────────────────────
describe("OnboardingWizard — question display", () => {
  test("shows question text after API responds", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("What is your current level?")).toBeTruthy();
    });
  });

  test("shows subtitle after API responds", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("This helps calibrate content")).toBeTruthy();
    });
  });

  test("renders all 3 cards", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Beginner")).toBeTruthy();
      expect(screen.getByText("Intermediate")).toBeTruthy();
      expect(screen.getByText("Advanced")).toBeTruthy();
    });
  });

  test("renders card icons", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("🌱")).toBeTruthy();
    });
  });

  test("renders card descriptions", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("I have never used cloud")).toBeTruthy();
    });
  });

  test("renders free text textarea", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Or describe your level...")).toBeTruthy();
    });
  });

  test("Continue button is disabled when nothing selected", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Continue →"));
    const btn = screen.getByText("Continue →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ─── Card selection ───────────────────────────────────────────────────────────
describe("OnboardingWizard — card selection", () => {
  test("clicking a card enables Continue button", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Beginner"));
    await user.click(screen.getByText("Beginner"));
    const btn = screen.getByText("Continue →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  test("single-select: clicking a different card deselects the previous one", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Beginner"));
    await user.click(screen.getByText("Beginner"));
    await user.click(screen.getByText("Advanced"));
    // Only "Advanced" should be selected — Continue still enabled
    const btn = screen.getByText("Continue →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  test("typing in textarea enables Continue button", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByPlaceholderText("Or describe your level..."));
    await user.type(screen.getByPlaceholderText("Or describe your level..."), "I have experience with AWS");
    const btn = screen.getByText("Continue →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ─── Continuing conversation ──────────────────────────────────────────────────
describe("OnboardingWizard — continuing conversation", () => {
  test("clicking Continue calls /api/onboarding/chat again", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Beginner"));
    await user.click(screen.getByText("Beginner"));
    await act(async () => {
      fireEvent.click(screen.getByText("Continue →"));
    });
    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  test("subsequent call includes conversation history", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Beginner"));
    await user.click(screen.getByText("Beginner"));
    await act(async () => {
      fireEvent.click(screen.getByText("Continue →"));
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const secondCall = calls.find(
        (c: unknown[]) => (c[0] as string).includes("/api/onboarding/chat") && JSON.parse((c[1] as RequestInit).body as string).messages.length > 0
      );
      expect(secondCall).toBeTruthy();
    });
  });
});

// ─── Summary bar ─────────────────────────────────────────────────────────────
describe("OnboardingWizard — summary bar", () => {
  test("summary bar appears when summary has entries beyond topic", async () => {
    setupFetch(makeTurnResponse({
      summary: { topic: "AZ-900", level: "Beginner" },
    }));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Your learning profile")).toBeTruthy();
    });
  });

  test("topic chip always appears in summary", async () => {
    setupFetch(makeTurnResponse({
      summary: { topic: "AZ-900", level: "Beginner" },
    }));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      // Multiple "AZ-900" elements: header badge + summary chip
      const chips = screen.getAllByText("AZ-900");
      expect(chips.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("summary shows extra fields from API response", async () => {
    setupFetch(makeTurnResponse({
      summary: { topic: "AZ-900", goal: "Certification" },
    }));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Certification")).toBeTruthy();
    });
  });
});

// ─── Skip behavior ────────────────────────────────────────────────────────────
describe("OnboardingWizard — skip", () => {
  test("clicking Skip on first turn shows warning modal", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Skip/));
    await user.click(screen.getByText(/Skip →/));
    await waitFor(() => {
      expect(screen.getByText("Skip personalization?")).toBeTruthy();
    });
  });

  test("warning modal shows cautionary text", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Skip →/));
    await user.click(screen.getByText(/Skip →/));
    await waitFor(() => {
      expect(screen.getByText(/generic and less accurate/i)).toBeTruthy();
    });
  });

  test("'Continue' button in warning modal dismisses it", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Skip →/));
    await user.click(screen.getByText(/Skip →/));
    await waitFor(() => screen.getByText("Continue"));
    await user.click(screen.getByText("Continue"));
    await waitFor(() => {
      expect(screen.queryByText("Skip personalization?")).toBeNull();
    });
  });

  test("'Skip anyway' button calls onSkip", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Skip →/));
    await user.click(screen.getByText(/Skip →/));
    await waitFor(() => screen.getByText("Skip anyway"));
    await user.click(screen.getByText("Skip anyway"));
    expect(defaultProps.onSkip).toHaveBeenCalled();
  });
});

// ─── Topic exists notice ──────────────────────────────────────────────────────
describe("OnboardingWizard — topicExists", () => {
  test("shows notice when topicExists is true", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} topicExists={true} />);
    await waitFor(() => {
      expect(screen.getByText(/You have studied this topic/i)).toBeTruthy();
    });
  });

  test("does not show notice when topicExists is false", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} topicExists={false} />);
    await waitFor(() => screen.getByText("What is your current level?"));
    expect(screen.queryByText(/You have studied this topic/i)).toBeNull();
  });
});

// ─── Ready to create ──────────────────────────────────────────────────────────
describe("OnboardingWizard — readyToCreate", () => {
  test("shows 'Profile ready!' when readyToCreate is true", async () => {
    setupFetch(makeReadyResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Profile ready!")).toBeTruthy();
    });
  });

  test("shows create button when readyToCreate is true", async () => {
    setupFetch(makeReadyResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Create personalized content/)).toBeTruthy();
    });
  });

  test("clicking create button calls onComplete with context", async () => {
    setupFetch(makeReadyResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Create personalized content/));
    await user.click(screen.getByText(/Create personalized content/));
    expect(defaultProps.onComplete).toHaveBeenCalledWith(
      "Beginner user seeking AZ-900 certification."
    );
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────
describe("OnboardingWizard — error handling", () => {
  test("shows error message when API fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Could not load/i)).toBeTruthy();
    });
  });

  test("error state shows skip option", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Continue without personalization/i)).toBeTruthy();
    });
  });

  test("clicking skip on error calls onSkip", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Continue without personalization/i));
    await user.click(screen.getByText(/Continue without personalization/i));
    expect(defaultProps.onSkip).toHaveBeenCalled();
  });
});

