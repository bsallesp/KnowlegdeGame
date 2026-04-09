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

vi.mock("@/components/PricingTable", () => ({
  default: () => <div data-testid="pricing-table" />,
}));
vi.mock("@/components/WaitlistForm", () => ({
  default: () => <div data-testid="waitlist-form" />,
}));

import LandingPage from "@/components/LandingPage";

describe("LandingPage", () => {
  test("renders brand and primary nav links", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("Dystoppia").length).toBeGreaterThanOrEqual(1);
    const logins = screen.getAllByRole("link", { name: /log in/i });
    expect(logins[0]).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /start free/i })).toHaveAttribute("href", "/register");
  });

  test("renders an LLM-style prompt composer and suggestions", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /what do you want to learn today/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /learning prompt/i })).toBeTruthy();
    expect(screen.getByText(/build a learning plan/i)).toBeTruthy();
    expect(screen.getByTestId("pricing-table")).toBeTruthy();
    expect(screen.getByTestId("waitlist-form")).toBeTruthy();
  });
});
