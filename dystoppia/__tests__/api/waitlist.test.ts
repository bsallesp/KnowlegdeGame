import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUpsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { waitlistEntry: { upsert: mockUpsert } },
}));

import { POST } from "@/app/api/waitlist/route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUpsert.mockReset();
  mockUpsert.mockResolvedValue({});
});

describe("POST /api/waitlist", () => {
  test("returns 400 for missing email", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid email", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  test("upserts normalized email and returns ok", async () => {
    const res = await POST(req({ email: "  Hello@Example.COM ", source: "landing" }));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { email: "hello@example.com" },
      create: { email: "hello@example.com", source: "landing" },
      update: {},
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("returns 500 when prisma throws", async () => {
    mockUpsert.mockRejectedValue(new Error("db"));
    const res = await POST(req({ email: "x@y.com" }));
    expect(res.status).toBe(500);
  });
});
