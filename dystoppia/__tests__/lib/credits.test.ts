import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFindFirst = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    creditLedger: {
      findFirst: mockFindFirst,
      findMany: mockFindMany,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

import {
  adjustCredits,
  appendCreditLedgerEvent,
  getCurrentCreditBalance,
  listCreditLedger,
} from "@/lib/credits";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentCreditBalance", () => {
  test("returns zero when there is no ledger entry", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getCurrentCreditBalance("user-1")).resolves.toBe(0);
  });

  test("returns latest balanceAfter", async () => {
    mockFindFirst.mockResolvedValue({ balanceAfter: 42 });
    await expect(getCurrentCreditBalance("user-1")).resolves.toBe(42);
  });
});

describe("listCreditLedger", () => {
  test("caps requested limit to 100", async () => {
    mockFindMany.mockResolvedValue([]);
    await listCreditLedger("user-1", 500);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      })
    );
  });
});

describe("appendCreditLedgerEvent", () => {
  test("rejects zero amounts", async () => {
    await expect(
      appendCreditLedgerEvent({
        userId: "user-1",
        eventType: "top_up",
        amount: 0,
        reason: "invalid",
      })
    ).rejects.toThrow(/cannot be zero/i);
  });

  test("creates a new ledger entry with updated balance", async () => {
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        creditLedger: {
          findFirst: vi.fn().mockResolvedValue({ balanceAfter: 10 }),
          create: mockCreate.mockResolvedValue({
            id: "ledger-1",
            balanceAfter: 25,
          }),
        },
      })
    );

    const entry = await appendCreditLedgerEvent({
      userId: "user-1",
      eventType: "top_up",
      amount: 15,
      reason: "manual top-up",
      createdByUserId: "master-1",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 15,
          balanceAfter: 25,
        }),
      })
    );
    expect(entry).toEqual({ id: "ledger-1", balanceAfter: 25 });
  });

  test("throws when resulting balance would be negative", async () => {
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        creditLedger: {
          findFirst: vi.fn().mockResolvedValue({ balanceAfter: 4 }),
          create: vi.fn(),
        },
      })
    );

    await expect(
      appendCreditLedgerEvent({
        userId: "user-1",
        eventType: "deduction",
        amount: -5,
        reason: "charge",
      })
    ).rejects.toThrow(/insufficient credits/i);
  });
});

describe("adjustCredits", () => {
  test("writes an audit entry after ledger adjustment", async () => {
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        creditLedger: {
          findFirst: vi.fn().mockResolvedValue({ balanceAfter: 0 }),
          create: vi.fn().mockResolvedValue({
            id: "ledger-1",
            balanceAfter: 30,
          }),
        },
      })
    );

    await adjustCredits({
      userId: "user-1",
      amount: 30,
      reason: "seed balance",
      actorUserId: "master-1",
      actorRole: "master",
    });

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "master-1",
        actorRole: "master",
        eventType: "credits.adjusted",
      })
    );
  });
});
