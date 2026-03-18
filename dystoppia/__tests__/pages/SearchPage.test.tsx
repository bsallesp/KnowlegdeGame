import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
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
    form: ({ children, onSubmit, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props as any;
      return <form onSubmit={onSubmit as any} {...rest}>{children}</form>;
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

// ─── NeuralTransition mock ────────────────────────────────────────────────────
vi.mock("@/components/NeuralTransition", () => ({
  default: ({ visible, topic }: { visible: boolean; topic: string }) =>
    visible ? <div data-testid="neural-transition" data-topic={topic} /> : null,
}));

// ─── Router mock ──────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
}));

// ─── Store mock ───────────────────────────────────────────────────────────────
const mockSetCurrentTopic = vi.fn();
const mockAddItemToCurrentTopic = vi.fn();
const mockResetSession = vi.fn();

vi.mock("@/store/useAppStore", () => ({
  default: () => ({
    setCurrentTopic: mockSetCurrentTopic,
    addItemToCurrentTopic: mockAddItemToCurrentTopic,
    resetSession: mockResetSession,
  }),
}));

// ─── Auth mock (controlled per test via variable) ─────────────────────────────
let mockAuthLoading = false;

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => ({ loading: mockAuthLoading }),
}));

import SearchPage from "@/app/page";

const topicsResponse = {
  topics: [
    { id: "t1", name: "AZ-900", slug: "az-900", createdAt: "2024-01-01T00:00:00.000Z", totalAnswers: 40, correctRate: 0.75 },
    { id: "t2", name: "Docker Basics", slug: "docker-basics", createdAt: "2024-01-02T00:00:00.000Z", totalAnswers: 10, correctRate: null },
  ],
};

function setupFetch(topicsOk = true, structureOk = true, structureBody?: BodyInit) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/topics")) {
      return topicsOk
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(topicsResponse) })
        : Promise.reject(new Error("topics fetch failed"));
    }
    if (url.includes("/api/generate-structure")) {
      if (!structureOk) {
        return Promise.resolve({
          ok: false,
          body: null,
          json: () => Promise.resolve({ error: "LLM error" }),
        });
      }
      return Promise.resolve({
        ok: true,
        body: structureBody || null,
        json: () => Promise.reject(new Error("not expected")),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }) as any;
}

beforeEach(() => {
  mockAuthLoading = false;
  mockPush.mockReset();
  mockSetCurrentTopic.mockReset();
  mockAddItemToCurrentTopic.mockReset();
  mockResetSession.mockReset();
  setupFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────
describe("SearchPage — basic rendering", () => {
  test("renders the Dystoppia logo heading", async () => {
    render(<SearchPage />);
    expect(screen.getByRole("heading", { name: /dystoppia/i })).toBeTruthy();
  });

  test("renders the tagline text", async () => {
    render(<SearchPage />);
    expect(screen.getByText(/adaptive knowledge learning/i)).toBeTruthy();
  });

  test("renders the search input", async () => {
    render(<SearchPage />);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  test("search input starts empty", async () => {
    render(<SearchPage />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  test("renders at least one submit button or button element", async () => {
    render(<SearchPage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  test("heading level is h1", async () => {
    render(<SearchPage />);
    const h1 = document.querySelector("h1");
    expect(h1).toBeTruthy();
    expect(h1!.textContent).toContain("Dystoppia");
  });

  test("renders main landmark element", async () => {
    render(<SearchPage />);
    expect(screen.getByRole("main")).toBeTruthy();
  });
});

// ─── Auth loading ─────────────────────────────────────────────────────────────
describe("SearchPage — auth loading", () => {
  test("returns null (renders nothing) when authLoading is true", async () => {
    mockAuthLoading = true;
    const { container } = render(<SearchPage />);
    expect(container.firstChild).toBeNull();
  });

  test("renders page when authLoading is false", async () => {
    mockAuthLoading = false;
    render(<SearchPage />);
    expect(screen.getByRole("heading", { name: /dystoppia/i })).toBeTruthy();
  });
});

// ─── Topic history ────────────────────────────────────────────────────────────
describe("SearchPage — topic history", () => {
  test("fetches /api/topics on mount", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/topics");
    });
  });

  test("displays history topic names after load", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("AZ-900")).toBeTruthy();
    });
  });

  test("displays all history topics", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("AZ-900")).toBeTruthy();
      expect(screen.getByText("Docker Basics")).toBeTruthy();
    });
  });

  test("does not crash when topics fetch fails", async () => {
    setupFetch(false);
    expect(() => render(<SearchPage />)).not.toThrow();
  });

  test("displays correct rate percentage for topics with rate", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText(/75%/)).toBeTruthy();
    });
  });

  test("does not fetch topics when auth is loading", async () => {
    mockAuthLoading = true;
    render(<SearchPage />);
    // Wait a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).not.toHaveBeenCalledWith("/api/topics");
  });
});

// ─── Input interaction ────────────────────────────────────────────────────────
describe("SearchPage — input interaction", () => {
  test("input value updates when user types", async () => {
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "kubernetes");
    expect((input as HTMLInputElement).value).toBe("kubernetes");
  });

  test("input clears after typing and deleting", async () => {
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "test");
    await user.clear(input);
    expect((input as HTMLInputElement).value).toBe("");
  });

  test("empty form submission does not call /api/generate-structure", async () => {
    render(<SearchPage />);
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("generate-structure"),
      expect.anything()
    );
  });

  test("whitespace-only input does not call API", async () => {
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "   ");
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("generate-structure"),
      expect.anything()
    );
  });
});

// ─── Search submission ────────────────────────────────────────────────────────
describe("SearchPage — search submission", () => {
  test("calls /api/generate-structure with POST method", async () => {
    setupFetch(true, false); // structure fails so we don't deal with stream
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    const form = document.querySelector("form")!;
    await act(async () => { fireEvent.submit(form); });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/generate-structure",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("sends topic in request body", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]: [string]) => url.includes("generate-structure")
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1].body);
      expect(body.topic).toBe("AZ-900");
    });
  });

  test("calls resetSession before searching", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      expect(mockResetSession).toHaveBeenCalled();
    });
  });

  test("calls setCurrentTopic with pending topic", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      expect(mockSetCurrentTopic).toHaveBeenCalledWith(
        expect.objectContaining({ name: "AZ-900" })
      );
    });
  });

  test("pending topic id starts with 'pending_'", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      const topicArg = mockSetCurrentTopic.mock.calls[0][0];
      expect(topicArg.id).toMatch(/^pending_/);
    });
  });

  test("shows NeuralTransition during search", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      expect(screen.getByTestId("neural-transition")).toBeTruthy();
    });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────
describe("SearchPage — error handling", () => {
  test("shows error when API returns non-ok", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      expect(screen.getByText(/lLM error|failed|error|wrong/i)).toBeTruthy();
    }, { timeout: 3000 });
  });

  test("shows error when fetch throws network error", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/topics")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
      return Promise.reject(new Error("network failure"));
    }) as any;
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      expect(screen.getByText(/network failure|wrong|error|failed/i)).toBeTruthy();
    }, { timeout: 3000 });
  });

  test("hides NeuralTransition after error", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    await waitFor(() => {
      expect(screen.queryByTestId("neural-transition")).toBeNull();
    }, { timeout: 3000 });
  });
});

// ─── History topic click ──────────────────────────────────────────────────────
describe("SearchPage — history click", () => {
  test("clicking history topic calls API with that topic", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    await waitFor(() => screen.getByText("AZ-900"));
    await act(async () => { fireEvent.click(screen.getByText("AZ-900")); });
    await waitFor(() => {
      const structureCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]: [string]) => url.includes("generate-structure")
      );
      expect(structureCall).toBeTruthy();
    }, { timeout: 3000 });
  });
});
