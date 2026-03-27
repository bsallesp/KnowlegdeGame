import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";

const mockSetUser = vi.hoisted(() => vi.fn());
const mockSetPlan = vi.hoisted(() => vi.fn());
const mockSetSubscriptionStatus = vi.hoisted(() => vi.fn());
const mockSetRateLimitState = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAppStore", () => ({
  default: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setUser: mockSetUser,
      setPlan: mockSetPlan,
      setSubscriptionStatus: mockSetSubscriptionStatus,
      setRateLimitState: mockSetRateLimitState,
    }),
}));

import { useCheckUser } from "@/lib/useCheckUser";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("useCheckUser", () => {
  test("ends with authenticated false when /api/auth/me not ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useCheckUser());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authenticated).toBe(false);
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  test("sets authenticated and hydrates store when me returns 200", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "id-1",
          email: "e@e.com",
          plan: "learner",
          subscriptionStatus: "active",
          hourlyUsage: 1,
          hourlyRemaining: 29,
          hourlyResetsAt: "2026-01-01T00:00:00.000Z",
          weeklyUsage: 2,
          weeklyRemaining: 248,
          weeklyResetsAt: "2026-01-08T00:00:00.000Z",
        }),
    });

    const { result } = renderHook(() => useCheckUser());
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    expect(mockSetUser).toHaveBeenCalledWith("id-1", "e@e.com");
    expect(mockSetPlan).toHaveBeenCalledWith("learner");
    expect(mockSetSubscriptionStatus).toHaveBeenCalledWith("active");
    expect(mockSetRateLimitState).toHaveBeenCalled();
  });
});
