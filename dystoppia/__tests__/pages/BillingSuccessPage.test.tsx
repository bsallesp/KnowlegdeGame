import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const mockSetPlan = vi.hoisted(() => vi.fn());
const mockSetRateLimitState = vi.hoisted(() => vi.fn());
const mockSetSubscriptionStatus = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAppStore", () => ({
  default: (
    selector: (s: {
      setPlan: typeof mockSetPlan;
      setRateLimitState: typeof mockSetRateLimitState;
      setSubscriptionStatus: typeof mockSetSubscriptionStatus;
    }) => unknown,
  ) =>
    selector({
      setPlan: mockSetPlan,
      setRateLimitState: mockSetRateLimitState,
      setSubscriptionStatus: mockSetSubscriptionStatus,
    }),
}));

import BillingSuccessPage from "@/app/billing/success/page";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          plan: "learner",
          subscriptionStatus: "active",
          creditBalance: 480,
          hourlyUsage: 0,
          hourlyRemaining: 30,
          hourlyResetsAt: "2026-01-01T01:00:00.000Z",
          weeklyUsage: 0,
          weeklyRemaining: 250,
          weeklyResetsAt: "2026-01-08T00:00:00.000Z",
        }),
    }),
  ) as typeof fetch;
});

describe("BillingSuccessPage", () => {
  test("fetches billing status and updates store", async () => {
    render(<BillingSuccessPage />);
    expect(screen.getByRole("heading", { name: /billing updated/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to builder/i })).toHaveAttribute("href", "/builder");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/billing/status");
    });
    await waitFor(() => {
      expect(screen.getByText(/Current credit balance: 480/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(mockSetPlan).toHaveBeenCalledWith("learner");
      expect(mockSetSubscriptionStatus).toHaveBeenCalledWith("active");
      expect(mockSetRateLimitState).toHaveBeenCalled();
    });
  });
});
