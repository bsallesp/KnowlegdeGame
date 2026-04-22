import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockTopicFindUnique = vi.hoisted(() => vi.fn());
const mockTopicCreate = vi.hoisted(() => vi.fn());
const mockItemCreate = vi.hoisted(() => vi.fn());
const mockSubItemCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    topic: { findUnique: mockTopicFindUnique, create: mockTopicCreate },
    item: { create: mockItemCreate },
    subItem: { create: mockSubItemCreate },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Anthropic mock ───────────────────────────────────────────────────────────
const mockStream = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStream };
  },
}));

// ─── Auth guard mock ──────────────────────────────────────────────────────────
const mockRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));

// ─── Credits mock ─────────────────────────────────────────────────────────────
const mockDeductCredits = vi.hoisted(() => vi.fn());
const MockCreditError = vi.hoisted(() => {
  class Err extends Error {
    remaining: number;
    constructor(remaining: number) { super("Insufficient credits"); this.remaining = remaining; }
  }
  return Err;
});
vi.mock("@/lib/credits", () => ({
  deductCredits: mockDeductCredits,
  CreditError: MockCreditError,
}));

// ─── Rate limit mock (new system) ────────────────────────────────────────────
const mockCheckRateLimit = vi.hoisted(() => vi.fn());

const MockRateLimitError = vi.hoisted(() => {
  return class MockRateLimitError extends Error {
    window: "hourly" | "weekly";
    remaining: number;
    resetsAt: Date;

    constructor(window: "hourly" | "weekly", remaining: number, resetsAt: Date) {
      super("Rate limit exceeded");
      this.window = window;
      this.remaining = remaining;
      this.resetsAt = resetsAt;
    }
  };
});

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RateLimitError: MockRateLimitError,
}));

// ─── LLM usage logger mock (avoid Prisma writes) ─────────────────────────────
vi.mock("@/lib/llmLogger", () => ({
  logLLMUsage: vi.fn(),
}));

import { POST } from "@/app/api/generate-structure/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/generate-structure", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeNdjsonStream(lines: string[]) {
  let index = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (index < lines.length) {
            return { done: false, value: { type: "text", text: lines[index++] + "\n" } };
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

function makeLLMStream(chunks: string[]) {
  let index = 0;
  const stream: any = {
    // generate-structure registers `llmStream.on("message", ...)`
    on: () => stream,
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (index < chunks.length) {
            return {
              done: false,
              value: {
                type: "content_block_delta",
                delta: { type: "text_delta", text: chunks[index++] },
              },
            };
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
  return stream;
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  mockTopicFindUnique.mockReset();
  mockTopicCreate.mockReset();
  mockItemCreate.mockReset();
  mockSubItemCreate.mockReset();
  mockStream.mockReset();
  mockRequireUser.mockReset();
  mockDeductCredits.mockReset();
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockDeductCredits.mockResolvedValue(45);
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue({
    hourlyUsage: 0,
    hourlyRemaining: 0,
    hourlyResetsAt: new Date(),
    weeklyUsage: 0,
    weeklyRemaining: 0,
    weeklyResetsAt: new Date(),
  });
});

const profileLine = JSON.stringify({
  type: "profile",
  data: {
    style: "scenario_based",
    register: "technical_professional",
    questionPatterns: ["What happens when..."],
    contextHint: "Focus on practical scenarios",
    exampleDomain: "Azure portal",
    assessmentFocus: "application",
  },
});

const itemLine = JSON.stringify({
  type: "item",
  data: {
    name: "Cloud Concepts",
    subItems: [{ name: "IaaS" }, { name: "PaaS" }],
  },
});

describe("POST /api/generate-structure — validation", () => {
  test("returns 400 when topic is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  test("returns 400 when topic is not a string", async () => {
    const res = await POST(makeRequest({ topic: 123 }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when topic is empty string", async () => {
    const res = await POST(makeRequest({ topic: "" }));
    expect(res.status).toBe(400);
  });

  test("returns error message for missing topic", async () => {
    const res = await POST(makeRequest({}));
    const data = await res.json();
    expect(data.error).toMatch(/topic is required/i);
  });
});

describe("POST /api/generate-structure — cache hit", () => {
  test("returns SSE stream on cache hit", async () => {
    const existingTopic = {
      id: "topic-1",
      name: "AZ-900",
      slug: "az-900",
      teachingProfile: null,
      items: [
        {
          id: "item-1",
          name: "Cloud Concepts",
          order: 0,
          subItems: [{ id: "sub-1", name: "IaaS", order: 0 }],
        },
      ],
    };
    mockTopicFindUnique.mockResolvedValue(existingTopic);

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  });

  test("streams item events from cached topic", async () => {
    const existingTopic = {
      id: "topic-1",
      slug: "az-900",
      teachingProfile: null,
      items: [
        { id: "item-1", name: "Cloud Concepts", order: 0, subItems: [] },
      ],
    };
    mockTopicFindUnique.mockResolvedValue(existingTopic);

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }
    expect(fullText).toContain('"type":"item"');
  });

  test("streams done event from cached topic", async () => {
    const existingTopic = {
      id: "topic-1",
      slug: "az-900",
      teachingProfile: null,
      items: [],
    };
    mockTopicFindUnique.mockResolvedValue(existingTopic);

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }
    expect(fullText).toContain('"type":"done"');
  });

  test("parses teachingProfile JSON when cached", async () => {
    const profile = { style: "scenario_based", register: "technical_professional" };
    const existingTopic = {
      id: "topic-1",
      slug: "az-900",
      teachingProfile: JSON.stringify(profile),
      items: [],
    };
    mockTopicFindUnique.mockResolvedValue(existingTopic);

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }
    expect(fullText).toContain('"style":"scenario_based"');
  });

  test("does not call LLM on cache hit", async () => {
    mockTopicFindUnique.mockResolvedValue({ id: "topic-1", slug: "az-900", teachingProfile: null, items: [] });
    await POST(makeRequest({ topic: "AZ-900" }));
    expect(mockStream).not.toHaveBeenCalled();
  });

  test("uses slugified topic to query cache", async () => {
    mockTopicFindUnique.mockResolvedValue(null);
    mockStream.mockReturnValue(makeNdjsonStream([]));
    mockTopicCreate.mockResolvedValue({ id: "t1", slug: "car-mechanics" });

    await POST(makeRequest({ topic: "Car Mechanics" }));
    expect(mockTopicFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "car-mechanics" } })
    );
  });
});

describe("POST /api/generate-structure — SSE headers", () => {
  test("sets Cache-Control: no-cache on cache hit", async () => {
    mockTopicFindUnique.mockResolvedValue({ id: "t1", slug: "az-900", teachingProfile: null, items: [] });
    const res = await POST(makeRequest({ topic: "AZ-900" }));
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  test("sets Connection: keep-alive on cache hit", async () => {
    mockTopicFindUnique.mockResolvedValue({ id: "t1", slug: "az-900", teachingProfile: null, items: [] });
    const res = await POST(makeRequest({ topic: "AZ-900" }));
    expect(res.headers.get("Connection")).toBe("keep-alive");
  });
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("POST /api/generate-structure — auth guard", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(new NextResponse(null, { status: 401 }));
    const res = await POST(makeRequest({ topic: "AZ-900" }));
    expect(res.status).toBe(401);
  });

  test("does not call LLM when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(new NextResponse(null, { status: 401 }));
    await POST(makeRequest({ topic: "AZ-900" }));
    expect(mockStream).not.toHaveBeenCalled();
  });
});

// ─── Rate limit system ────────────────────────────────────────────────────────

describe("POST /api/generate-structure — rate limit system", () => {
  test("does not call rate limit on cache hit", async () => {
    mockTopicFindUnique.mockResolvedValue({ id: "t1", slug: "az-900", teachingProfile: null, items: [] });
    await POST(makeRequest({ topic: "AZ-900" }));
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  test("calls checkRateLimit on cache miss before streaming", async () => {
    mockTopicFindUnique.mockResolvedValue(null);
    mockStream.mockReturnValue(makeNdjsonStream([]));
    mockTopicCreate.mockResolvedValue({ id: "t1", slug: "az-900" });

    await POST(makeRequest({ topic: "AZ-900" }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("user-1", 1, "curriculum");
  });

  test("returns 429 on cache miss when rate limit is exceeded", async () => {
    mockTopicFindUnique.mockResolvedValue(null);
    mockCheckRateLimit.mockRejectedValue(
      new MockRateLimitError("hourly", 2, new Date("2026-01-02T00:00:00.000Z")),
    );

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    expect(res.status).toBe(429);
  });

  test("includes remaining and resetsAt in 429 response", async () => {
    mockTopicFindUnique.mockResolvedValue(null);
    mockCheckRateLimit.mockRejectedValue(
      new MockRateLimitError("weekly", 2, new Date("2026-01-08T00:00:00.000Z")),
    );

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.window).toBe("weekly");
    expect(body.remaining).toBe(2);
    expect(body.upgradeUrl).toBe("/pricing");
  });

  test("does not call LLM when rate limit is exceeded on cache miss", async () => {
    mockTopicFindUnique.mockResolvedValue(null);
    mockCheckRateLimit.mockRejectedValue(
      new MockRateLimitError("hourly", 0, new Date("2026-01-02T00:00:00.000Z")),
    );

    await POST(makeRequest({ topic: "AZ-900" }));
    expect(mockStream).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate-structure — cache miss streaming parse", () => {
  test("parses profile + item from correct LLM stream chunks (including remaining buffer)", async () => {
    mockTopicFindUnique.mockResolvedValue(null);

    // Emit profile line with newline, then emit item line without newline so it is parsed in the remaining buffer section.
    mockStream.mockReturnValue(makeLLMStream([profileLine + "\n", itemLine]));

    const newTopic = {
      id: "topic-1",
      name: "AZ-900",
      slug: "az-900",
      teachingProfile: null,
      items: [
        {
          id: "item-1",
          name: "Cloud Concepts",
          order: 0,
          subItems: [{ id: "sub-1", name: "IaaS", order: 0, difficulty: 1 }],
        },
      ],
    };
    mockTopicCreate.mockResolvedValue(newTopic);

    const res = await POST(makeRequest({ topic: "AZ-900" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }

    // profile and item events are streamed
    expect(fullText).toContain('"type":"profile"');
    expect(fullText).toContain('"type":"item"');
    // done event is streamed and includes teachingProfile
    expect(fullText).toContain('"type":"done"');
    expect(fullText).toContain('"style":"scenario_based"');
  });
});
