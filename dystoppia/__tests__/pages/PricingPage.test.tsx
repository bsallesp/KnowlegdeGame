import { describe, test, expect, vi, beforeEach } from "vitest";
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
  },
}));

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => ({ loading: false }),
}));

vi.mock("@/components/PricingTable", () => ({
  default: ({ currentPlan }: { currentPlan?: string }) => (
    <div data-testid="pricing-table" data-plan={currentPlan} />
  ),
}));

const mockPlan = vi.hoisted(() => vi.fn(() => "learner"));

vi.mock("@/store/useAppStore", () => ({
  default: (selector: (s: { plan: string }) => unknown) =>
    selector({ plan: mockPlan() }),
}));

import PricingPage from "@/app/pricing/page";

beforeEach(() => {
  mockPlan.mockReturnValue("learner");
});

describe("PricingPage", () => {
  test("shows upgrade heading and pricing table with store plan", () => {
    render(<PricingPage />);
    expect(screen.getByRole("heading", { name: /upgrade your plan/i })).toBeTruthy();
    expect(screen.getByTestId("pricing-table")).toHaveAttribute("data-plan", "learner");
    expect(screen.getByRole("link", { name: /back to app/i })).toHaveAttribute("href", "/");
  });
});
