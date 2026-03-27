"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface WaitlistFormProps {
  source?: string;
}

export default function WaitlistForm({ source = "landing_hero" }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm font-medium"
        style={{ color: "#818CF8" }}
      >
        You&apos;re on the list.
      </motion.p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
        style={{
          backgroundColor: "#1C1C28",
          border: "1px solid #2E2E40",
          color: "#EEEEFF",
        }}
      />
      <motion.button
        type="submit"
        disabled={status === "loading"}
        whileHover={{ scale: status === "loading" ? 1 : 1.03 }}
        whileTap={{ scale: status === "loading" ? 1 : 0.97 }}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          backgroundColor: "#818CF8",
          color: "#09090E",
          opacity: status === "loading" ? 0.7 : 1,
        }}
      >
        {status === "loading" ? "..." : "Join"}
      </motion.button>
      {status === "error" && (
        <p className="text-xs" style={{ color: "#F97316" }}>
          Something went wrong.
        </p>
      )}
    </form>
  );
}
