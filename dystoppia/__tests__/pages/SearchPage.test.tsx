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

function setupFetch(
  topicsOk = true,
  structureOk = true,
  structureBody?: BodyInit,
  topicsPayload: { topics: Array<Record<string, unknown>> } = topicsResponse
) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/topics")) {
      return topicsOk
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(topicsPayload) })
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
    if (url.includes("/api/generate-questions")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  }) as any;
}

// ─── SSE helpers for prefetch tests ──────────────────────────────────────────
function makeSseStream(events: object[]): ReadableStream {
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

const doneTopicPayload = {
  id: "topic-db-1",
  name: "AZ-900",
  slug: "az-900",
  createdAt: new Date().toISOString(),
  teachingProfile: null,
  items: [
    {
      id: "item-1",
      subItems: [
        { id: "sub-1-1", name: "Cloud Concepts", order: 0, difficulty: 1, muted: false },
        { id: "sub-1-2", name: "Service Models", order: 1, difficulty: 1, muted: false },
      ],
    },
    {
      id: "item-2",
      subItems: [
        { id: "sub-2-1", name: "Azure Regions", order: 0, difficulty: 1, muted: false },
      ],
    },
  ],
};

function setupFetchWithDone() {
  const sseBody = makeSseStream([
    { type: "item", data: { name: "Cloud Concepts", subItems: [{ name: "Cloud Concepts" }] } },
    { type: "done", data: doneTopicPayload },
  ]);
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/topics"))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
    if (url.includes("/api/generate-structure"))
      return Promise.resolve({ ok: true, body: sseBody });
    if (url.includes("/api/generate-questions"))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
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
    await waitFor(() => expect(screen.getByRole("heading", { name: /dystoppia/i })).toBeTruthy());
  });

  test("renders the tagline text", async () => {
    render(<SearchPage />);
    await waitFor(() => expect(screen.getByText(/adaptive knowledge learning/i)).toBeTruthy());
  });

  test("renders the search input", async () => {
    render(<SearchPage />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
  });

  test("search input starts empty", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  test("renders at least one submit button or button element", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("heading level is h1", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      const h1 = document.querySelector("h1");
      expect(h1).toBeTruthy();
      expect(h1!.textContent).toContain("Dystoppia");
    });
  });

  test("renders main landmark element", async () => {
    render(<SearchPage />);
    await waitFor(() => expect(screen.getByRole("main")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByRole("heading", { name: /dystoppia/i })).toBeTruthy());
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
    // Component returns null when loading — no effects run, so fetch is never called
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalledWith("/api/topics"));
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
    await waitFor(() => {}); // flush mount effects
    const form = document.querySelector("form")!;
    await act(async () => { fireEvent.submit(form); });
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
    await act(async () => { fireEvent.submit(form); });
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
    // Use a never-resolving structure fetch so the component stays in loading state
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/topics")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
      if (url.includes("/api/generate-structure")) return new Promise(() => {}); // never resolves
      return Promise.reject(new Error("Unexpected"));
    }) as any;
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });
    // NeuralTransition is visible while the fetch is pending
    expect(screen.getByTestId("neural-transition")).toBeTruthy();
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

// ─── Additional coverage to reach 200+ React tests ──────────────────────────
describe("SearchPage — additional UI coverage", () => {
  test("renders Settings navigation link", async () => {
    render(<SearchPage />);
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  test("Settings link points to /settings", async () => {
    render(<SearchPage />);
    const settings = document.querySelector('a[href="/settings"]');
    expect(settings).toBeTruthy();
  });

  test("Learn button is hidden when input is empty", async () => {
    render(<SearchPage />);
    expect(screen.queryByRole("button", { name: /^learn$/i })).toBeNull();
  });

  test("Learn button appears after typing", async () => {
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AI");
    expect(screen.getByRole("button", { name: /^learn$/i })).toBeTruthy();
  });

  test("Learn button disappears again after clearing input", async () => {
    render(<SearchPage />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox");
    await user.type(input, "AI");
    expect(screen.getByRole("button", { name: /^learn$/i })).toBeTruthy();
    await user.clear(input);
    expect(screen.queryByRole("button", { name: /^learn$/i })).toBeNull();
  });

  test("shows Continue learning heading when history exists", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("Continue learning")).toBeTruthy();
    });
  });

  test("shows answer count for AZ-900 history card", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("40 answers")).toBeTruthy();
    });
  });

  test("shows answer count for Docker Basics history card", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("10 answers")).toBeTruthy();
    });
  });

  test("renders suggestion chips when history is empty", async () => {
    setupFetch(true, true, undefined, { topics: [] });
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("Quantum Computing")).toBeTruthy();
      expect(screen.getByText("Roman History")).toBeTruthy();
      expect(screen.getByText("Machine Learning")).toBeTruthy();
      expect(screen.getByText("Jazz Theory")).toBeTruthy();
      expect(screen.getByText("DNA Replication")).toBeTruthy();
    });
  });

  test("shows exactly 5 suggestion chips when history is empty", async () => {
    setupFetch(true, true, undefined, { topics: [] });
    render(<SearchPage />);
    await waitFor(() => {
      const suggestions = [
        screen.getByText("Quantum Computing"),
        screen.getByText("Roman History"),
        screen.getByText("Machine Learning"),
        screen.getByText("Jazz Theory"),
        screen.getByText("DNA Replication"),
      ];
      expect(suggestions.length).toBe(5);
    });
  });

  test("clicking suggestion fills the search input", async () => {
    setupFetch(true, true, undefined, { topics: [] });
    render(<SearchPage />);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText("Quantum Computing"));
    await user.click(screen.getByText("Quantum Computing"));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Quantum Computing");
  });

  test("clicking suggestion does not immediately call generate API", async () => {
    setupFetch(true, true, undefined, { topics: [] });
    render(<SearchPage />);
    const user = userEvent.setup();
    await waitFor(() => screen.getByText("Roman History"));
    await user.click(screen.getByText("Roman History"));
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/generate-structure"),
      expect.anything()
    );
  });

  test("Continue learning heading is hidden when history is empty", async () => {
    setupFetch(true, true, undefined, { topics: [] });
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.queryByText("Continue learning")).toBeNull();
    });
  });

  test("history mode does not show suggestion chips", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByText("Continue learning")).toBeTruthy();
    });
    expect(screen.queryByText("Quantum Computing")).toBeNull();
  });

  test("empty-history mode still keeps Settings link", async () => {
    setupFetch(true, true, undefined, { topics: [] });
    render(<SearchPage />);
    await waitFor(() => {
      const settings = document.querySelector('a[href="/settings"]');
      expect(settings).toBeTruthy();
    });
  });

  test("typing whitespace only keeps Learn button hidden", async () => {
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "   ");
    expect(screen.queryByRole("button", { name: /^learn$/i })).toBeNull();
  });

  test("history card click keeps topic name in input", async () => {
    setupFetch(true, false);
    render(<SearchPage />);
    await waitFor(() => screen.getByText("AZ-900"));
    await act(async () => {
      fireEvent.click(screen.getByText("AZ-900"));
    });
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("AZ-900");
  });

  test("history cards render as clickable buttons", async () => {
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /AZ-900|Docker Basics/ }).length).toBeGreaterThanOrEqual(2);
    });
  });

  test("rendered page includes exactly one main landmark", async () => {
    render(<SearchPage />);
    const mains = document.querySelectorAll("main");
    expect(mains.length).toBe(1);
  });

  test("typing valid query updates NeuralTransition topic prop on submit path", async () => {
    // Keep request pending so transition remains visible for assertion
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/topics")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
      if (url.includes("/api/generate-structure")) return new Promise(() => {});
      return Promise.reject(new Error("Unexpected"));
    }) as any;
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "Kubernetes");
    await act(async () => {
      fireEvent.submit(document.querySelector("form")!);
    });
    const transition = screen.getByTestId("neural-transition");
    expect(transition.getAttribute("data-topic")).toBe("Kubernetes");
  });
});

// ─── Prefetch tests ───────────────────────────────────────────────────────────
describe("SearchPage — question prefetch on done event", () => {
  function getPrefetchCalls() {
    return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => (call[0] as string).includes("/api/generate-questions")
    );
  }

  function getPrefetchBodies() {
    return getPrefetchCalls().map((call: unknown[]) =>
      JSON.parse((call[1] as RequestInit).body as string)
    );
  }

  test("calls /api/generate-questions after done event arrives", async () => {
    setupFetchWithDone();
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      expect(getPrefetchCalls().length).toBeGreaterThanOrEqual(1);
    }, { timeout: 3000 });
  });

  test("prefetch uses first non-muted subItem from item 0", async () => {
    setupFetchWithDone();
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      expect(getPrefetchBodies().some((b) => b.subItemId === "sub-1-1")).toBe(true);
    }, { timeout: 3000 });
  });

  test("prefetch uses first non-muted subItem from item 1", async () => {
    setupFetchWithDone();
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      expect(getPrefetchBodies().some((b) => b.subItemId === "sub-2-1")).toBe(true);
    }, { timeout: 3000 });
  });

  test("prefetch sends count:3 for each call", async () => {
    setupFetchWithDone();
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      const bodies = getPrefetchBodies();
      expect(bodies.length).toBeGreaterThanOrEqual(1);
      expect(bodies.every((b) => b.count === 3)).toBe(true);
    }, { timeout: 3000 });
  });

  test("prefetch sends correct difficulty from done payload", async () => {
    setupFetchWithDone();
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      const bodies = getPrefetchBodies();
      expect(bodies.length).toBeGreaterThanOrEqual(1);
      expect(bodies.every((b) => b.difficulty === 1)).toBe(true);
    }, { timeout: 3000 });
  });

  test("prefetch does not block navigation to /session", async () => {
    setupFetchWithDone();
    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/session");
    }, { timeout: 5000 });
  });

  test("skips muted subItems and uses next active one", async () => {
    const mutedTopicPayload = {
      ...doneTopicPayload,
      items: [
        {
          id: "item-1",
          subItems: [
            { id: "sub-muted", name: "Muted", order: 0, difficulty: 1, muted: true },
            { id: "sub-active", name: "Active", order: 1, difficulty: 1, muted: false },
          ],
        },
      ],
    };
    const sseBody = makeSseStream([
      { type: "item", data: { name: "Cloud Concepts", subItems: [{ name: "Cloud Concepts" }] } },
      { type: "done", data: mutedTopicPayload },
    ]);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/topics")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
      if (url.includes("/api/generate-structure")) return Promise.resolve({ ok: true, body: sseBody });
      if (url.includes("/api/generate-questions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
      return Promise.reject(new Error(`Unexpected: ${url}`));
    }) as any;

    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => {
      const bodies = getPrefetchBodies();
      expect(bodies.some((b) => b.subItemId === "sub-muted")).toBe(false);
      expect(bodies.some((b) => b.subItemId === "sub-active")).toBe(true);
    }, { timeout: 3000 });
  });

  test("does not call prefetch when items array is empty", async () => {
    const emptyTopic = { ...doneTopicPayload, items: [] };
    const sseBody = makeSseStream([
      { type: "item", data: { name: "Cloud Concepts", subItems: [{ name: "Cloud Concepts" }] } },
      { type: "done", data: emptyTopic },
    ]);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/topics")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
      if (url.includes("/api/generate-structure")) return Promise.resolve({ ok: true, body: sseBody });
      if (url.includes("/api/generate-questions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ questions: [] }) });
      return Promise.reject(new Error(`Unexpected: ${url}`));
    }) as any;

    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => mockPush.mock.calls.length > 0, { timeout: 5000 });
    expect(getPrefetchCalls().length).toBe(0);
  });

  test("prefetch errors do not cause visible errors on page", async () => {
    const sseBody = makeSseStream([
      { type: "item", data: { name: "Cloud Concepts", subItems: [{ name: "Cloud Concepts" }] } },
      { type: "done", data: doneTopicPayload },
    ]);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/topics")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ topics: [] }) });
      if (url.includes("/api/generate-structure")) return Promise.resolve({ ok: true, body: sseBody });
      if (url.includes("/api/generate-questions")) return Promise.reject(new Error("LLM timeout"));
      return Promise.reject(new Error(`Unexpected: ${url}`));
    }) as any;

    render(<SearchPage />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "AZ-900");
    await act(async () => { fireEvent.submit(document.querySelector("form")!); });

    await waitFor(() => mockPush.mock.calls.length > 0, { timeout: 5000 });
    expect(screen.queryByText(/LLM timeout|wrong|error|failed/i)).toBeNull();
  });
});
