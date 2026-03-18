import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockItemFindUnique = vi.hoisted(() => vi.fn());
const mockItemUpdate = vi.hoisted(() => vi.fn());
const mockSubItemFindUnique = vi.hoisted(() => vi.fn());
const mockSubItemUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: { findUnique: mockItemFindUnique, update: mockItemUpdate },
    subItem: { findUnique: mockSubItemFindUnique, update: mockSubItemUpdate },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/toggle-mute/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/toggle-mute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockItemFindUnique.mockReset();
  mockItemUpdate.mockReset();
  mockSubItemFindUnique.mockReset();
  mockSubItemUpdate.mockReset();
});

describe("POST /api/toggle-mute — validation", () => {
  test("returns 400 when id is missing", async () => {
    const res = await POST(makeRequest({ type: "item" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when type is missing", async () => {
    const res = await POST(makeRequest({ id: "item-1" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid type", async () => {
    const res = await POST(makeRequest({ id: "item-1", type: "unknown" }));
    expect(res.status).toBe(400);
  });

  test("returns error message for missing fields", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();
    expect(data.error).toMatch(/missing required/i);
  });

  test("returns error 'Invalid type' for wrong type value", async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ id: "item-1", type: "topic" }));
    const data = await res.json();
    expect(data.error).toMatch(/invalid type/i);
  });
});

describe("POST /api/toggle-mute — item type", () => {
  test("returns 404 when item not found", async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ id: "item-999", type: "item" }));
    expect(res.status).toBe(404);
  });

  test("returns error message when item not found", async () => {
    mockItemFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ id: "item-999", type: "item" }));
    const data = await res.json();
    expect(data.error).toMatch(/item not found/i);
  });

  test("toggles mute from false to true", async () => {
    mockItemFindUnique.mockResolvedValue({ id: "item-1", muted: false });
    mockItemUpdate.mockResolvedValue({ muted: true });

    const res = await POST(makeRequest({ id: "item-1", type: "item" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.muted).toBe(true);
  });

  test("toggles mute from true to false", async () => {
    mockItemFindUnique.mockResolvedValue({ id: "item-1", muted: true });
    mockItemUpdate.mockResolvedValue({ muted: false });

    const res = await POST(makeRequest({ id: "item-1", type: "item" }));
    const data = await res.json();
    expect(data.muted).toBe(false);
  });

  test("calls update with negated muted value", async () => {
    mockItemFindUnique.mockResolvedValue({ id: "item-1", muted: false });
    mockItemUpdate.mockResolvedValue({ muted: true });

    await POST(makeRequest({ id: "item-1", type: "item" }));
    expect(mockItemUpdate).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { muted: true },
    });
  });
});

describe("POST /api/toggle-mute — subitem type", () => {
  test("returns 404 when subitem not found", async () => {
    mockSubItemFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ id: "sub-999", type: "subitem" }));
    expect(res.status).toBe(404);
  });

  test("toggles subitem mute from false to true", async () => {
    mockSubItemFindUnique.mockResolvedValue({ id: "sub-1", muted: false });
    mockSubItemUpdate.mockResolvedValue({ muted: true });

    const res = await POST(makeRequest({ id: "sub-1", type: "subitem" }));
    const data = await res.json();
    expect(data.muted).toBe(true);
  });

  test("toggles subitem mute from true to false", async () => {
    mockSubItemFindUnique.mockResolvedValue({ id: "sub-1", muted: true });
    mockSubItemUpdate.mockResolvedValue({ muted: false });

    const res = await POST(makeRequest({ id: "sub-1", type: "subitem" }));
    const data = await res.json();
    expect(data.muted).toBe(false);
  });

  test("calls subItem.update with correct args", async () => {
    mockSubItemFindUnique.mockResolvedValue({ id: "sub-1", muted: true });
    mockSubItemUpdate.mockResolvedValue({ muted: false });

    await POST(makeRequest({ id: "sub-1", type: "subitem" }));
    expect(mockSubItemUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { muted: false },
    });
  });

  test("does not call item methods when type is subitem", async () => {
    mockSubItemFindUnique.mockResolvedValue({ id: "sub-1", muted: false });
    mockSubItemUpdate.mockResolvedValue({ muted: true });

    await POST(makeRequest({ id: "sub-1", type: "subitem" }));
    expect(mockItemFindUnique).not.toHaveBeenCalled();
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/toggle-mute — error handling", () => {
  test("returns 500 when item.update throws", async () => {
    mockItemFindUnique.mockResolvedValue({ id: "item-1", muted: false });
    mockItemUpdate.mockRejectedValue(new Error("DB write failed"));

    const res = await POST(makeRequest({ id: "item-1", type: "item" }));
    expect(res.status).toBe(500);
  });

  test("returns error key in 500 response", async () => {
    mockSubItemFindUnique.mockResolvedValue({ id: "sub-1", muted: false });
    mockSubItemUpdate.mockRejectedValue(new Error("constraint error"));

    const res = await POST(makeRequest({ id: "sub-1", type: "subitem" }));
    const data = await res.json();
    expect(data.error).toBe("Failed to toggle mute");
  });
});
