import { describe, test, expect, vi } from "vitest";

// ─── Cookie mock ──────────────────────────────────────────────────────────────

const mockSet = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockSet,
    }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { DELETE } from "@/app/api/auth/logout/route";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DELETE /api/auth/logout", () => {
  test("returns 200 with ok: true", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("clears the dystoppia_uid cookie with empty value", async () => {
    await DELETE();
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "",
      expect.objectContaining({ maxAge: 0 })
    );
  });

  test("sets httpOnly on the cleared cookie", async () => {
    await DELETE();
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "",
      expect.objectContaining({ httpOnly: true })
    );
  });

  test("sets path / on the cleared cookie", async () => {
    await DELETE();
    expect(mockSet).toHaveBeenCalledWith(
      "dystoppia_uid",
      "",
      expect.objectContaining({ path: "/" })
    );
  });
});
