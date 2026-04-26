import { describe, test, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lLMUsageLog: { create: mockCreate },
    aIModelPrice: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/lib/pricing", () => ({
  getActivePrice: vi.fn().mockResolvedValue(null),
  calculateRawCost: vi.fn().mockReturnValue(0),
}));

import {
  calculateAnthropicCost,
  calculateTTSCost,
  logLLMUsage,
} from "@/lib/llmLogger";

beforeEach(() => {
  mockCreate.mockClear();
});

describe("calculateAnthropicCost", () => {
  test("returns 0 for unknown model", () => {
    expect(calculateAnthropicCost("unknown", 1, 1)).toBe(0);
  });

  test("applies Haiku rates", () => {
    const oneMIn = 1_000_000;
    const c = calculateAnthropicCost("claude-haiku-4-5", oneMIn, oneMIn);
    // 0.80/1M input + 4.0/1M output = 0.80 + 4.0 = 4.80
    expect(c).toBeCloseTo(0.80 + 4.0, 5);
  });
});

describe("calculateTTSCost", () => {
  test("scales by character count", () => {
    const c = calculateTTSCost("openai-tts", 1000);
    expect(c).toBeGreaterThan(0);
  });
});

describe("logLLMUsage", () => {
  test("calls prisma create without throwing", async () => {
    logLLMUsage({
      userId: "u1",
      model: "claude-haiku-4-5",
      endpoint: "/api/test",
      inputTokens: 100,
      outputTokens: 50,
    });
    await vi.waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.data.endpoint).toBe("/api/test");
    expect(arg.data.userId).toBe("u1");
  });
});
