import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush    = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div:    ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <div {...p}>{children}</div>,
    form:   ({ children, onSubmit, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <form onSubmit={onSubmit as React.FormEventHandler} {...p}>{children}</form>,
    button: ({ children, onClick, disabled, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <button onClick={onClick as React.MouseEventHandler} disabled={disabled as boolean} {...p}>{children}</button>,
    p:      ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <p {...p}>{children}</p>,
    h1:     ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...p}>{children}</h1>,
    span:   ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => <span {...p}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Import after mocks ───────────────────────────────────────────────────────

import RegisterPage from "@/app/register/page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupNotLoggedIn() {
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/auth/me") return Promise.resolve({ ok: false, status: 401 });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupNotLoggedIn();
});

// ─── Step 1 rendering ─────────────────────────────────────────────────────────

describe("RegisterPage — step 1 rendering", () => {
  test("renders Dystoppia title", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Dystoppia")).toBeTruthy();
  });

  test("renders 'Create your account' subtitle", () => {
    render(<RegisterPage />);
    expect(screen.getByText("Create your account")).toBeTruthy();
  });

  test("renders email input", () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
  });

  test("renders password input", () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText("Min. 8 characters")).toBeTruthy();
  });

  test("renders confirm password input", () => {
    render(<RegisterPage />);
    expect(screen.getByPlaceholderText("Repeat your password")).toBeTruthy();
  });

  test("renders Create account button", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
  });

  test("renders Sign in link", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
  });
});

// ─── Step 1 validation ────────────────────────────────────────────────────────

describe("RegisterPage — step 1 validation", () => {
  test("shows error when password is too short", async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "short");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByText(/8 characters/i)).toBeTruthy());
  });

  test("shows error when passwords don't match", async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "different1");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByText(/don't match/i)).toBeTruthy());
  });
});

// ─── Step 1 API interaction ───────────────────────────────────────────────────

describe("RegisterPage — step 1 API interaction", () => {
  test("calls /api/auth/register on valid submit", async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/register",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  test("advances to verify step on successful registration", async () => {
    render(<RegisterPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeTruthy());
  });

  test("shows error message when API returns error", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/register") return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Something went wrong." }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    render(<RegisterPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByText("Something went wrong.")).toBeTruthy());
  });

  test("shows generic error on network failure", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/register") return Promise.reject(new Error("Network error"));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    render(<RegisterPage />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
  });
});

// ─── Step 2 — OTP verification ────────────────────────────────────────────────

describe("RegisterPage — step 2 OTP verification", () => {
  async function goToStep2() {
    const user = userEvent.setup();
    render(<RegisterPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@test.com");
    await user.type(screen.getByPlaceholderText("Min. 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => screen.getByText(/check your inbox/i));
    return user;
  }

  test("shows OTP input after successful step 1", async () => {
    await goToStep2();
    expect(screen.getByPlaceholderText("000000")).toBeTruthy();
  });

  test("shows email in the verification message", async () => {
    await goToStep2();
    await waitFor(() => expect(screen.getByText("a@test.com")).toBeTruthy());
  });

  test("Verify button is disabled when code has fewer than 6 digits", async () => {
    const user = await goToStep2();
    await user.type(screen.getByPlaceholderText("000000"), "123");
    const btn = screen.getByRole("button", { name: /verify email/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  test("calls /api/auth/verify-email with email and code", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/register") return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      if (url === "/api/auth/verify-email") return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "u1", email: "a@test.com" }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const user = await goToStep2();
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /verify email/i }));
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/verify-email",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  test("redirects to / after successful verification", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/register") return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      if (url === "/api/auth/verify-email") return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "u1", email: "a@test.com" }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const user = await goToStep2();
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /verify email/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  test("shows error when OTP is wrong", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/register") return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      if (url === "/api/auth/verify-email") return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Incorrect code. Try again." }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    const user = await goToStep2();
    await user.type(screen.getByPlaceholderText("000000"), "999999");
    await user.click(screen.getByRole("button", { name: /verify email/i }));
    await waitFor(() => expect(screen.getByText("Incorrect code. Try again.")).toBeTruthy());
  });

  test("Back button returns to step 1", async () => {
    const user = await goToStep2();
    await user.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() => expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy());
  });
});

// ─── Already logged in ────────────────────────────────────────────────────────

describe("RegisterPage — already logged in", () => {
  test("redirects to / when already authenticated", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "u1", email: "a@b.com" }),
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    render(<RegisterPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });
});
