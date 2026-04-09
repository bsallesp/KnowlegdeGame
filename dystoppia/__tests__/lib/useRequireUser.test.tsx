import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockReplace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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

import { useRequireUser } from "@/lib/useRequireUser";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("useRequireUser", () => {
  test("redirects to /login when /api/auth/me is not ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    renderHook(() => useRequireUser());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(mockSetUser).not.toHaveBeenCalled();
  });

  test("redirects to /login when fetch throws", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network"));
    renderHook(() => useRequireUser());
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });

  test("hydrates store and clears loading when me returns 200", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "u1",
          email: "a@b.com",
          role: "master",
          status: "active",
          isInternal: true,
          plan: "learner",
          subscriptionStatus: "active",
          hourlyUsage: 0,
          hourlyRemaining: 5,
          hourlyResetsAt: null,
          weeklyUsage: 1,
          weeklyRemaining: 29,
          weeklyResetsAt: null,
        }),
    });

    const { result } = renderHook(() => useRequireUser());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSetUser).toHaveBeenCalledWith("u1", "a@b.com", "master", "active", true);
    expect(mockSetPlan).toHaveBeenCalledWith("learner");
    expect(mockSetSubscriptionStatus).toHaveBeenCalledWith("active");
    expect(mockSetRateLimitState).toHaveBeenCalledWith(
      expect.objectContaining({
        hourlyRemaining: 5,
        weeklyRemaining: 29,
      })
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
