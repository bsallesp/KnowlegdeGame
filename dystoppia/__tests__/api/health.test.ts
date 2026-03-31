import { describe, test, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/health/route";

const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  test("returns ok when DB responds", async () => {
    queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, db: "up" });
  });

  test("returns 503 when DB fails", async () => {
    queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, db: "down" });
  });
});
