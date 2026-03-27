import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
  default: () => ({ setUser: vi.fn() }),
}));

import ForgotPasswordPage from "@/app/forgot-password/page";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as typeof fetch;
});

describe("ForgotPasswordPage", () => {
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
});
