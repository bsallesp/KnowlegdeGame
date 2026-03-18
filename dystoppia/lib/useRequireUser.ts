"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAppStore from "@/store/useAppStore";

export function useRequireUser() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.id, data.email);
          setLoading(false);
        } else {
          router.replace("/register");
        }
      })
      .catch(() => {
        router.replace("/register");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading };
}
