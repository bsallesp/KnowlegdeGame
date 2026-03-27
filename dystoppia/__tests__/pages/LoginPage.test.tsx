import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSetUser = vi.fn();

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
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...(p as object)}>{children}</div>
    ),
    button: ({
      children,
      type,
      disabled,
      onClick,
      ...p
    }: React.PropsWithChildren<
      Record<string, unknown> & { type?: string; disabled?: boolean; onClick?: () => void }
    >) => (
      <button type={type as "button" | "submit"} disabled={disabled} onClick={onClick} {...(p as object)}>
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
  default: (selector: (s: { setUser: typeof mockSetUser }) => unknown) =>
    selector({ setUser: mockSetUser }),
}));

import LoginPage from "@/app/login/page";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn((url: string) => {
    if (url === "/api/auth/me") return Promise.resolve({ ok: false, status: 401 });
    return Promise.reject(new Error(`unexpected ${url}`));
  }) as typeof fetch;
});

describe("LoginPage", () => {
  test("renders welcome and form fields", () => {
    render(<LoginPage />);
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(screen.getByPlaceholderText("Your password")).toBeTruthy();
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  test("successful login pushes home and sets user", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/login") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "u1", email: "a@b.com" }),
        });
      }
      return Promise.reject(new Error(url));
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Your password"), "password12");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith("u1", "a@b.com");
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  test("shows API error message on failure", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve({ ok: false });
      if (url === "/api/auth/login") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Invalid credentials" }),
        });
      }
      return Promise.reject(new Error(url));
    });

    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText("you@example.com"), "x@y.com");
    await user.type(screen.getByPlaceholderText("Your password"), "password12");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeTruthy();
    });
  });
});
