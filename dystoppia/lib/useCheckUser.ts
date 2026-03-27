"use client";

import { useEffect, useState } from "react";
import useAppStore from "@/store/useAppStore";

/**
 * Non-redirecting auth check. Returns { authenticated, loading }.
 * Use this on pages that should show different content for
 * authenticated vs unauthenticated users (e.g. landing page).
 */
export function useCheckUser() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const setUser = useAppStore((s) => s.setUser);
  const setPlan = useAppStore((s) => s.setPlan);
  const setSubscriptionStatus = useAppStore((s) => s.setSubscriptionStatus);
  const setRateLimitState = useAppStore((s) => s.setRateLimitState);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.id, data.email);
          setPlan(data.plan ?? "free");
          setSubscriptionStatus(data.subscriptionStatus ?? "inactive");
          setRateLimitState({
            hourlyUsage: data.hourlyUsage ?? 0,
            hourlyRemaining: data.hourlyRemaining ?? 5,
            hourlyResetsAt: data.hourlyResetsAt ?? null,
            weeklyUsage: data.weeklyUsage ?? 0,
            weeklyRemaining: data.weeklyRemaining ?? 30,
            weeklyResetsAt: data.weeklyResetsAt ?? null,
          });
          setAuthenticated(true);
        }
      })
      .catch(() => {
        // Not authenticated — no redirect, just show landing
      })
      .finally(() => {
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { authenticated, loading };
}
