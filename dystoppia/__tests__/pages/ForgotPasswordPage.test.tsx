import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockPush = vi.hoisted(() => vi.fn());
const mockSetUser = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...(p as object)}>{children}</div>
    ),
    form: ({ children, onSubmit, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <form onSubmit={onSubmit as React.FormEventHandler} {...(p as object)}>
        {children}
      </form>
    ),
    button: ({
      children,
      type,
      onClick,
      disabled,
      ...p
    }: React.PropsWithChildren<
      Record<string, unknown> & { type?: string; onClick?: () => void; disabled?: boolean }
    >) => (
      <button type={type as "button" | "submit"} onClick={onClick} disabled={disabled} {...(p as object)}>
        {children}
      </button>
    ),
    p: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...(p as object)}>{children}</p>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/store/useAppStore", () => ({
  default: (selector: (state: { setUser: typeof mockSetUser }) => unknown) =>
    selector({ setUser: mockSetUser }),
}));

import ForgotPasswordPage from "@/app/forgot-password/page";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ForgotPasswordPage", () => {
  test("shows generic error when send-code request fails", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(() => Promise.reject(new Error("network fail"))) as typeof fetch;
    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
    });
  });

  test("email step calls forgot-password API and shows code step", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/forgot-password",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("000000")).toBeTruthy();
    });
  });

  test("code step back button returns to email step", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));
    await screen.findByPlaceholderText("000000");

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
  });

  test("password reset validates minimum length", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));
    await user.type(await screen.findByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.type(await screen.findByPlaceholderText("New password (min. 8 chars)"), "123");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "123");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    expect(screen.getByText("Password must be at least 8 characters.")).toBeTruthy();
  });

  test("password reset validates password confirmation", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));
    await user.type(await screen.findByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.type(await screen.findByPlaceholderText("New password (min. 8 chars)"), "12345678");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "87654321");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    expect(screen.getByText("Passwords don't match.")).toBeTruthy();
  });

  test("returns to code step when reset API says code is invalid", async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: "Code expired" }) }) as typeof fetch;

    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));
    await user.type(await screen.findByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(await screen.findByPlaceholderText("New password (min. 8 chars)"), "12345678");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "12345678");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("000000")).toBeTruthy();
    });
  });

  test("sets user and redirects on successful reset", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes('"password"')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "u1", email: "user@test.com" }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }) as typeof fetch;

    render(<ForgotPasswordPage />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "user@test.com");
    await user.click(screen.getByRole("button", { name: /send reset code/i }));
    await user.type(await screen.findByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(await screen.findByPlaceholderText("New password (min. 8 chars)"), "12345678");
    await user.type(screen.getByPlaceholderText("Confirm new password"), "12345678");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith("u1", "user@test.com");
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
