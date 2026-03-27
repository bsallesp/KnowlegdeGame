import { describe, test, expect } from "vitest";
import { POST } from "@/app/api/billing/purchase/route";

describe("POST /api/billing/purchase (deprecated)", () => {
  test("returns 410 Gone", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
  });

  test("returns message pointing to checkout route", async () => {
    const res = await POST();
    const body = await res.json();
    expect(body.error).toContain("/api/billing/checkout");
  });
});
