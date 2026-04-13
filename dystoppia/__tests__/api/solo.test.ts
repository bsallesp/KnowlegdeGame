import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mockItemFindUnique = vi.hoisted(() => vi.fn());
const mockSubItemFindUnique = vi.hoisted(() => vi.fn());
const mockItemUpdateMany = vi.hoisted(() => vi.fn());
const mockItemUpdate = vi.hoisted(() => vi.fn());
const mockSubItemUpdateMany = vi.hoisted(() => vi.fn());
const mockSubItemUpdate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: {
      findUnique: mockItemFindUnique,
      updateMany: mockItemUpdateMany,
      update: mockItemUpdate,
    },
    subItem: {
      findUnique: mockSubItemFindUnique,
      updateMany: mockSubItemUpdateMany,
      update: mockSubItemUpdate,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/solo/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/solo", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockItemFindUnique.mockReset();
  mockSubItemFindUnique.mockReset();
  mockItemUpdateMany.mockReset().mockReturnValue(Promise.resolve({ count: 1 }));
  mockItemUpdate.mockReset().mockReturnValue(Promise.resolve({ id: "item-1" }));
  mockSubItemUpdateMany.mockReset().mockReturnValue(Promise.resolve({ count: 1 }));
  mockSubItemUpdate.mockReset().mockReturnValue(Promise.resolve({ id: "sub-1" }));
  mockTransaction.mockReset().mockImplementation(async (operations: unknown[]) => Promise.all(operations as Promise<unknown>[]));
});

describe("POST /api/solo", () => {
  test("returns 400 when payload is invalid", async () => {
    const res = await POST(makeRequest({ id: "", type: "topic" }));
    expect(res.status).toBe(400);
  });

  test("focuses an item and mutes the rest of the topic", async () => {
    mockItemFindUnique.mockResolvedValue({
      id: "item-2",
      topicId: "topic-1",
      topic: {
        items: [
          { id: "item-1", muted: false, subItems: [{ id: "sub-1", muted: false }] },
          { id: "item-2", muted: false, subItems: [{ id: "sub-2", muted: false }] },
        ],
      },
    });

    const res = await POST(makeRequest({ id: "item-2", type: "item" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mode).toBe("solo");
    expect(mockItemUpdateMany).toHaveBeenCalledWith({
      where: { topicId: "topic-1" },
      data: { muted: true },
    });
    expect(mockSubItemUpdateMany).toHaveBeenCalledWith({
      where: { itemId: { in: ["item-1", "item-2"] } },
      data: { muted: true },
    });
    expect(mockItemUpdate).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { muted: false },
    });
  });

  test("restores all items when the selected item is already solo", async () => {
    mockItemFindUnique.mockResolvedValue({
      id: "item-2",
      topicId: "topic-1",
      topic: {
        items: [
          { id: "item-1", muted: true, subItems: [{ id: "sub-1", muted: true }] },
          { id: "item-2", muted: false, subItems: [{ id: "sub-2", muted: false }] },
        ],
      },
    });

    const res = await POST(makeRequest({ id: "item-2", type: "item" }));
    const data = await res.json();

    expect(data.mode).toBe("all");
    expect(mockItemUpdateMany).toHaveBeenCalledWith({
      where: { topicId: "topic-1" },
      data: { muted: false },
    });
    expect(mockSubItemUpdateMany).toHaveBeenCalledWith({
      where: { itemId: { in: ["item-1", "item-2"] } },
      data: { muted: false },
    });
    expect(mockItemUpdate).not.toHaveBeenCalled();
  });

  test("focuses a subitem and mutes every other branch", async () => {
    mockSubItemFindUnique.mockResolvedValue({
      id: "sub-2",
      itemId: "item-1",
      item: {
        topicId: "topic-1",
        topic: {
          items: [
            {
              id: "item-1",
              muted: false,
              subItems: [
                { id: "sub-1", muted: false },
                { id: "sub-2", muted: false },
              ],
            },
            {
              id: "item-2",
              muted: false,
              subItems: [{ id: "sub-3", muted: false }],
            },
          ],
        },
      },
    });

    const res = await POST(makeRequest({ id: "sub-2", type: "subitem" }));
    const data = await res.json();

    expect(data.mode).toBe("solo");
    expect(mockItemUpdateMany).toHaveBeenCalledWith({
      where: { topicId: "topic-1" },
      data: { muted: true },
    });
    expect(mockItemUpdate).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { muted: false },
    });
    expect(mockSubItemUpdate).toHaveBeenCalledWith({
      where: { id: "sub-2" },
      data: { muted: false },
    });
  });
});
