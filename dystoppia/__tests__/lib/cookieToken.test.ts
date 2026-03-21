import { describe, test, expect, vi, beforeEach } from "vitest";
import { sign, verify } from "@/lib/cookieToken";

// ─── sign() ───────────────────────────────────────────────────────────────────

describe("sign()", () => {
  test("returns a string containing a dot separator", () => {
    const token = sign("user-abc");
    expect(token).toContain(".");
  });

  test("token starts with the userId", () => {
    const userId = "cldxyz123";
    const token = sign(userId);
    expect(token.startsWith(userId + ".")).toBe(true);
  });

  test("MAC portion is 32 hex characters", () => {
    const token = sign("user-1");
    const mac = token.split(".").pop()!;
    expect(mac).toMatch(/^[0-9a-f]{32}$/);
  });

  test("same userId always produces the same token (deterministic)", () => {
    expect(sign("user-1")).toBe(sign("user-1"));
  });

  test("different userIds produce different tokens", () => {
    expect(sign("user-1")).not.toBe(sign("user-2"));
  });
});

// ─── verify() ─────────────────────────────────────────────────────────────────

describe("verify() — valid tokens", () => {
  test("round-trips: verify(sign(id)) returns the original userId", () => {
    const userId = "user-roundtrip";
    expect(verify(sign(userId))).toBe(userId);
  });

  test("works with CUID-like userIds", () => {
    const userId = "clxyz0abc123def456";
    expect(verify(sign(userId))).toBe(userId);
  });
});

describe("verify() — invalid tokens", () => {
  test("returns null when token has no dot", () => {
    expect(verify("nodottoken")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(verify("")).toBeNull();
  });

  test("returns null when MAC is wrong length (not 32 chars)", () => {
    expect(verify("user-1.shortmac")).toBeNull();
  });

  test("returns null when MAC is tampered (one char changed)", () => {
    const token = sign("user-1");
    const dot = token.lastIndexOf(".");
    const tampered = token.slice(0, dot + 1) + "0".repeat(32);
    expect(verify(tampered)).toBeNull();
  });

  test("returns null when userId portion is empty", () => {
    const token = sign("user-1");
    const mac = token.split(".").pop()!;
    expect(verify("." + mac)).toBeNull();
  });

  test("returns null for completely garbage input", () => {
    expect(verify("aaaaa.bbbb.cccc")).toBeNull();
  });

  test("returns null when token was signed with a different secret", async () => {
    // Sign with a different secret by temporarily overriding env var
    const originalSecret = process.env.COOKIE_SECRET;
    process.env.COOKIE_SECRET = "secret-A";
    vi.resetModules();
    const { sign: signA } = await import("@/lib/cookieToken");
    const tokenA = signA("user-1");

    process.env.COOKIE_SECRET = "secret-B";
    vi.resetModules();
    const { verify: verifyB } = await import("@/lib/cookieToken");
    expect(verifyB(tokenA)).toBeNull();

    // Restore
    process.env.COOKIE_SECRET = originalSecret;
    vi.resetModules();
  });
});
