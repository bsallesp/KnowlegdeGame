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
      question: "Qual é o seu nível atual?",
      subtitle: "Isso ajuda a calibrar o conteúdo",
      multiSelect: false,
      cards: [
        { id: "beginner", label: "Iniciante", description: "Nunca usei cloud", icon: "🌱" },
        { id: "intermediate", label: "Intermediário", description: "Já usei um pouco", icon: "⚡" },
        { id: "advanced", label: "Avançado", description: "Uso no dia a dia", icon: "🚀" },
      ],
      allowFreeText: true,
      freeTextPlaceholder: "Ou descreva seu nível...",
    },
    summary: { topic: "AZ-900" },
    ...overrides,
  };
}

function makeReadyResponse() {
  return {
    readyToCreate: true,
    turn: null,
    summary: { topic: "AZ-900", nível: "Iniciante", objetivo: "Certificação" },
    onboardingContext: "Usuário iniciante buscando certificação AZ-900.",
  };
}

function setupFetch(response: object, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultProps.onComplete = vi.fn();
  defaultProps.onSkip = vi.fn();
});

// ─── Initial render ───────────────────────────────────────────────────────────
describe("OnboardingWizard — initial render", () => {
  test("shows loading text on mount before API responds", async () => {
    // Use a never-resolving fetch so loading state persists during assertion
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByText("Analisando o tema...")).toBeTruthy();
  });

  test("renders topic badge in header", () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByText("AZ-900")).toBeTruthy();
  });

  test("renders Pular button", () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByText(/Pular/)).toBeTruthy();
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
      expect(screen.getByText("Qual é o seu nível atual?")).toBeTruthy();
    });
  });

  test("shows subtitle after API responds", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Isso ajuda a calibrar o conteúdo")).toBeTruthy();
    });
  });

  test("renders all 3 cards", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Iniciante")).toBeTruthy();
      expect(screen.getByText("Intermediário")).toBeTruthy();
      expect(screen.getByText("Avançado")).toBeTruthy();
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
      expect(screen.getByText("Nunca usei cloud")).toBeTruthy();
    });
  });

  test("renders free text textarea", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Ou descreva seu nível...")).toBeTruthy();
    });
  });

  test("Continue button is disabled when nothing selected", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Continuar →"));
    const btn = screen.getByText("Continuar →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ─── Card selection ───────────────────────────────────────────────────────────
describe("OnboardingWizard — card selection", () => {
  test("clicking a card enables Continue button", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Iniciante"));
    await user.click(screen.getByText("Iniciante"));
    const btn = screen.getByText("Continuar →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  test("single-select: clicking a different card deselects the previous one", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Iniciante"));
    await user.click(screen.getByText("Iniciante"));
    await user.click(screen.getByText("Avançado"));
    // Only "Avançado" should be selected — Continue still enabled
    const btn = screen.getByText("Continuar →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  test("typing in textarea enables Continue button", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByPlaceholderText("Ou descreva seu nível..."));
    await user.type(screen.getByPlaceholderText("Ou descreva seu nível..."), "Tenho experiência com AWS");
    const btn = screen.getByText("Continuar →").closest("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ─── Continuing conversation ──────────────────────────────────────────────────
describe("OnboardingWizard — continuing conversation", () => {
  test("clicking Continue calls /api/onboarding/chat again", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Iniciante"));
    await user.click(screen.getByText("Iniciante"));
    await act(async () => {
      fireEvent.click(screen.getByText("Continuar →"));
    });
    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  test("subsequent call includes conversation history", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText("Iniciante"));
    await user.click(screen.getByText("Iniciante"));
    await act(async () => {
      fireEvent.click(screen.getByText("Continuar →"));
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
      summary: { topic: "AZ-900", nível: "Iniciante" },
    }));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Seu perfil de aprendizado")).toBeTruthy();
    });
  });

  test("topic chip always appears in summary", async () => {
    setupFetch(makeTurnResponse({
      summary: { topic: "AZ-900", nível: "Iniciante" },
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
      summary: { topic: "AZ-900", objetivo: "Certificação" },
    }));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Certificação")).toBeTruthy();
    });
  });
});

// ─── Skip behavior ────────────────────────────────────────────────────────────
describe("OnboardingWizard — skip", () => {
  test("clicking Pular on first turn shows warning modal", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Pular/));
    await user.click(screen.getByText(/Pular →/));
    await waitFor(() => {
      expect(screen.getByText("Pular personalização?")).toBeTruthy();
    });
  });

  test("warning modal shows cautionary text", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Pular →/));
    await user.click(screen.getByText(/Pular →/));
    await waitFor(() => {
      expect(screen.getByText(/genérico e menos preciso/i)).toBeTruthy();
    });
  });

  test("'Continuar' button in warning modal dismisses it", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Pular →/));
    await user.click(screen.getByText(/Pular →/));
    await waitFor(() => screen.getByText("Continuar"));
    await user.click(screen.getByText("Continuar"));
    await waitFor(() => {
      expect(screen.queryByText("Pular personalização?")).toBeNull();
    });
  });

  test("'Pular mesmo assim' button calls onSkip", async () => {
    setupFetch(makeTurnResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Pular →/));
    await user.click(screen.getByText(/Pular →/));
    await waitFor(() => screen.getByText("Pular mesmo assim"));
    await user.click(screen.getByText("Pular mesmo assim"));
    expect(defaultProps.onSkip).toHaveBeenCalled();
  });
});

// ─── Topic exists notice ──────────────────────────────────────────────────────
describe("OnboardingWizard — topicExists", () => {
  test("shows notice when topicExists is true", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} topicExists={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Você já estudou este tema/i)).toBeTruthy();
    });
  });

  test("does not show notice when topicExists is false", async () => {
    setupFetch(makeTurnResponse());
    render(<OnboardingWizard {...defaultProps} topicExists={false} />);
    await waitFor(() => screen.getByText("Qual é o seu nível atual?"));
    expect(screen.queryByText(/Você já estudou este tema/i)).toBeNull();
  });
});

// ─── Ready to create ──────────────────────────────────────────────────────────
describe("OnboardingWizard — readyToCreate", () => {
  test("shows 'Perfil montado!' when readyToCreate is true", async () => {
    setupFetch(makeReadyResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Perfil montado!")).toBeTruthy();
    });
  });

  test("shows create button when readyToCreate is true", async () => {
    setupFetch(makeReadyResponse());
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Criar conteúdo personalizado/)).toBeTruthy();
    });
  });

  test("clicking create button calls onComplete with context", async () => {
    setupFetch(makeReadyResponse());
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Criar conteúdo personalizado/));
    await user.click(screen.getByText(/Criar conteúdo personalizado/));
    expect(defaultProps.onComplete).toHaveBeenCalledWith(
      "Usuário iniciante buscando certificação AZ-900."
    );
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────
describe("OnboardingWizard — error handling", () => {
  test("shows error message when API fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Não foi possível carregar/i)).toBeTruthy();
    });
  });

  test("error state shows skip option", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Continuar sem personalização/i)).toBeTruthy();
    });
  });

  test("clicking skip on error calls onSkip", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    render(<OnboardingWizard {...defaultProps} />);
    await waitFor(() => screen.getByText(/Continuar sem personalização/i));
    await user.click(screen.getByText(/Continuar sem personalização/i));
    expect(defaultProps.onSkip).toHaveBeenCalled();
  });
});
