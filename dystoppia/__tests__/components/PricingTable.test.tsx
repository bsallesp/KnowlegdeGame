import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...(p as object)}>{children}</div>
    ),
    button: ({
      children,
      onClick,
      disabled,
      ...p
    }: React.PropsWithChildren<
      Record<string, unknown> & { onClick?: () => void; disabled?: boolean }
    >) => (
      <button onClick={onClick} disabled={disabled} {...(p as object)}>
        {children}
      </button>
    ),
  },
}));

import PricingTable from "@/components/PricingTable";

describe("PricingTable", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test("renders three plans", () => {
    render(<PricingTable currentPlan="free" />);
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Learner" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Master" })).toBeTruthy();
  });

  test("invokes onUpgrade for paid plan instead of fetch", () => {
    const onUpgrade = vi.fn();
    render(<PricingTable currentPlan="free" onUpgrade={onUpgrade} />);
    const buttons = screen.getAllByRole("button", { name: /subscribe/i });
    fireEvent.click(buttons[0]);
    expect(onUpgrade).toHaveBeenCalledWith("learner");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("free tier links to register when not current plan", () => {
    render(<PricingTable currentPlan="learner" />);
    const link = screen.getByRole("link", { name: /get started free/i });
    expect(link).toHaveAttribute("href", "/register");
  });
});
