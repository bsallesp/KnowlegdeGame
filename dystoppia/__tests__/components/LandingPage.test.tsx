import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

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
    h2: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <h2 {...(p as object)}>{children}</h2>
    ),
    p: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...(p as object)}>{children}</p>
    ),
    span: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...(p as object)}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import LandingPage from "@/components/LandingPage";

describe("LandingPage", () => {
  test("renders brand and primary nav links", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("Dystoppia").length).toBeGreaterThanOrEqual(1);
    const logins = screen.getAllByRole("link", { name: /log in/i });
    expect(logins[0]).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute("href", "/register");
  });

  test("renders chat-style composer and suggestion chips", () => {
    render(<LandingPage />);
    expect(screen.getByText(/what can i help you with/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/message dystoppia/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /start/i })).toHaveAttribute("href", "/register");
    const chips = screen.getAllByRole("link", { name: /help me learn/i });
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });
});
