"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";

export function useRequireUser() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);
  const setRateLimitState = useAppStore((s) => s.setRateLimitState);
  const setPlan = useAppStore((s) => s.setPlan);
  const setSubscriptionStatus = useAppStore((s) => s.setSubscriptionStatus);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(
            data.id,
            data.email,
            data.role ?? "customer",
            data.status ?? "active",
            data.isInternal ?? false
          );
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
          setLoading(false);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading };
}
