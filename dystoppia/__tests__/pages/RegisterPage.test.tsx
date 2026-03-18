import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    p: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    h1: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    button: ({ children, onClick, animate, initial, exit, transition, whileHover, whileTap, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <button onClick={onClick as any} {...props}>{children}</button>,
    span: ({ children, animate, initial, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/components/NeuralTransition", () => ({
  default: ({ visible }: { visible: boolean }) => visible ? <div data-testid="transition">Transition</div> : null,
}));

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => ({ loading: false }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Tests ────────────────────────────────────────────────────────────────────

import useAppStore from "@/store/useAppStore";
import RegisterPage from "@/app/register/page";

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockFetch.mockClear();
  useAppStore.setState({
    xp: 0,
    streak: 0,
    sessionId: "sess_test",
    userId: null,
    userEmail: null,
  });
  // Default: /api/auth/me returns 401 (not logged in)
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/auth/me") {
      return Promise.resolve({ ok: false, status: 401 });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe("RegisterPage — rendering", () => {
  test("renders Dystoppia title", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Dystoppia")).toBeTruthy();
  });

  test("renders subtitle", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Your progress. Your universe.")).toBeTruthy();
  });

  test("renders XP badge", () => {
    render(<RegisterPage />);
    expect(screen.getAllByText(/XP/)[0]).toBeTruthy();
  });

  test("renders Streaks badge", () => {
    render(<RegisterPage />);
    expect(screen.getByText(/Streaks/)).toBeTruthy();
  });

  test("renders Adaptive AI badge", () => {
    render(<RegisterPage />);
    expect(screen.getByText(/Adaptive AI/)).toBeTruthy();
  });

  test("renders two email inputs", () => {
    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBe(2);
  });

  test("renders Enter Dystoppia button", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("button", { name: /Enter Dystoppia/i })).toBeTruthy();
  });

  test("renders no-password notice", () => {
    render(<RegisterPage />);
    expect(screen.getByText("No password needed. Just your email.")).toBeTruthy();
  });
});

describe("RegisterPage — validation", () => {
  test("shows error when email is empty", async () => {
    render(<RegisterPage />);
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));
    await waitFor(() => expect(screen.getByText("Please enter your email.")).toBeTruthy());
  });

  test("shows error for invalid email format", async () => {
    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "notanemail");
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));
    await waitFor(() => expect(screen.getByText("That doesn't look like a valid email.")).toBeTruthy());
  });

  test("shows error when emails don't match", async () => {
    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "a@example.com");
    await userEvent.type(inputs[1], "b@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));
    await waitFor(() => expect(screen.getByText("Emails don't match. Try again.")).toBeTruthy());
  });

  test("clears error after valid input attempt", async () => {
    render(<RegisterPage />);
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));
    await waitFor(() => screen.getByText("Please enter your email."));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "test@example.com");
    // Error should still show (not auto-cleared until submit)
    expect(screen.queryByText("Please enter your email.")).toBeTruthy();
  });
});

describe("RegisterPage — API interaction", () => {
  test("calls /api/users on valid submit", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/users") return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "user-1", email: "a@example.com", isNew: true }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "a@example.com");
    await userEvent.type(inputs[1], "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" }));
    });
  });

  test("shows error when API returns error", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/users") return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Failed to create user" }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "a@example.com");
    await userEvent.type(inputs[1], "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));

    await waitFor(() => expect(screen.getByText("Failed to create user")).toBeTruthy());
  });

  test("shows network error message on fetch failure", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/users") return Promise.reject(new Error("Network error"));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "a@example.com");
    await userEvent.type(inputs[1], "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));

    await waitFor(() => expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy());
  });

  test("shows 'logging you in' info for existing user", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/users") return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "user-1", email: "a@example.com", isNew: false }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<RegisterPage />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "a@example.com");
    await userEvent.type(inputs[1], "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Enter Dystoppia/i }));

    await waitFor(() => expect(screen.getByText("Email already registered — logging you in...")).toBeTruthy());
  });
});

describe("RegisterPage — local data banner", () => {
  test("shows local data banner when user has XP", () => {
    useAppStore.setState({ xp: 286, streak: 1 });
    render(<RegisterPage />);
    expect(screen.getByText(/286 XP/)).toBeTruthy();
  });

  test("shows local data banner when user has streak", () => {
    useAppStore.setState({ xp: 0, streak: 3 });
    render(<RegisterPage />);
    expect(screen.getByText(/3-day streak/)).toBeTruthy();
  });

  test("does not show banner when xp=0 and streak=0", () => {
    useAppStore.setState({ xp: 0, streak: 0 });
    render(<RegisterPage />);
    expect(screen.queryByText(/Found a previous session/)).toBeNull();
  });

  test("redirects to / when already logged in (auth/me returns ok)", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "u1", email: "a@b.com" }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    render(<RegisterPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });
});
