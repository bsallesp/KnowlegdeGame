import { describe, test, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockCreate = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockBookPageFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    subItem: { findUnique: mockFindUnique },
    question: { findMany: mockFindMany, create: mockCreate },
    bookPage: { findMany: mockBookPageFindMany },
  },
}));

// ─── Anthropic mock ───────────────────────────────────────────────────────────

const mockCreate_llm = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate_llm };
  },
}));

// ─── Auth guard mock ──────────────────────────────────────────────────────────
const mockRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));

// ─── Credits mock ─────────────────────────────────────────────────────────────
const mockDeductCredits = vi.hoisted(() => vi.fn());
class MockCreditError extends Error {
  remaining: number;
  constructor(remaining: number) { super("Insufficient credits"); this.remaining = remaining; }
}
vi.mock("@/lib/credits", () => ({
  deductCredits: mockDeductCredits,
  CreditError: MockCreditError,
}));

// ─── Rate limit mock (new system) ────────────────────────────────────────────
const mockCheckRateLimit = vi.hoisted(() => vi.fn());

class MockRateLimitError extends Error {
  window: "hourly" | "weekly";
  remaining: number;
  resetsAt: Date;

  constructor(window: "hourly" | "weekly", remaining: number, resetsAt: Date) {
    super("Rate limit exceeded");
    this.window = window;
    this.remaining = remaining;
    this.resetsAt = resetsAt;
  }
}

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RateLimitError: MockRateLimitError,
}));

// ─── LLM usage logger mock (avoid Prisma writes) ─────────────────────────────
vi.mock("@/lib/llmLogger", () => ({
  logLLMUsage: vi.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockSubItem = {
  id: "sub-1",
  name: "Attack Vectors and Surfaces",
  difficulty: 1,
  item: {
    name: "Fundamentals",
    topic: { name: "Cyber Security", teachingProfile: null },
  },
};

function makeDbQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    subItemId: "sub-1",
    type: "multiple_choice",
    content: "What is an attack vector?",
    options: '["A","B","C","D"]',
    answer: "A",
    explanation: "Because A.",
    difficulty: 1,
    timeLimit: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLLMQuestion(overrides: Record<string, unknown> = {}) {
  return {
    type: "multiple_choice",
    content: "What is phishing?",
    options: ["Email fraud", "Malware", "Firewall", "VPN"],
    answer: "Email fraud",
    explanation: "Phishing uses deceptive emails.",
    timeLimit: null,
    ...overrides,
  };
}

function makeLLMResponse(questions: unknown[]) {
  return {
    content: [{ type: "text", text: JSON.stringify({ questions }) }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/generate-questions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Import route AFTER mocks are set up ─────────────────────────────────────

const { POST } = await import("@/app/api/generate-questions/route");

const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  mockUserFindUnique.mockResolvedValue({ id: "user-1" });
  mockFindUnique.mockResolvedValue(mockSubItem);
  mockBookPageFindMany.mockResolvedValue([]);
  mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data, id: "new-q", createdAt: new Date() })
  );
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockDeductCredits.mockResolvedValue(47);
  mockCheckRateLimit.mockResolvedValue({
    hourlyUsage: 0,
    hourlyRemaining: 0,
    hourlyResetsAt: new Date(),
    weeklyUsage: 0,
    weeklyRemaining: 0,
    weeklyResetsAt: new Date(),
  });
});

afterAll(() => {
  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
  }
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("input validation", () => {
  test("returns 400 when subItemId is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/subItemId/);
  });

  test("returns 404 when subItem does not exist in DB", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ subItemId: "ghost" }));
    expect(res.status).toBe(404);
  });
});

// ─── Cache hit path ───────────────────────────────────────────────────────────

describe("cache hit", () => {
  function fullCachePool(overrides: Partial<ReturnType<typeof makeDbQuestion>> = {}) {
    // REFILL_THRESHOLD = 15 — produce 16 so background refill does NOT trigger.
    return Array.from({ length: 16 }, (_, i) => makeDbQuestion({ id: `q-${i + 1}`, ...overrides }));
  }

  test("returns cached questions without calling the LLM", async () => {
    mockFindMany.mockResolvedValue(fullCachePool());

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    expect(res.status).toBe(200);
    expect(mockCreate_llm).not.toHaveBeenCalled();
    const { questions } = await res.json();
    expect(questions).toHaveLength(3);
  });

  test("returns cached questions without ANTHROPIC_API_KEY when cache is sufficient", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockFindMany.mockResolvedValue(fullCachePool());

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));

    expect(res.status).toBe(200);
    expect(mockCreate_llm).not.toHaveBeenCalled();
  });

  test("parses options JSON string into array on cache hit", async () => {
    mockFindMany.mockResolvedValue(fullCachePool({ options: '["A","B","C","D"]' }));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    const { questions } = await res.json();
    for (const q of questions) {
      expect(Array.isArray(q.options)).toBe(true);
    }
  });

  // ── Bug regression: fill_blank with null options crashed the UI ────────────
  test("excludes fill_blank questions with null options from cache hit", async () => {
    // 2 valid + 1 broken fill_blank — total 3, but only 2 valid
    mockFindMany.mockResolvedValue([
      makeDbQuestion({ id: "q-1", type: "fill_blank", options: '["photosynthesis","respiration"]' }),
      makeDbQuestion({ id: "q-2", type: "multiple_choice", options: '["A","B","C","D"]' }),
      makeDbQuestion({ id: "q-3", type: "fill_blank", options: null }), // broken
    ]);
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    // validQuestions.length (2) < count (3) → falls through to LLM generation
    expect(mockCreate_llm).toHaveBeenCalled();
  });

  test("allows fill_blank with valid options through cache hit", async () => {
    const valid1 = { type: "fill_blank", options: '["photosynthesis","respiration","fermentation"]' };
    mockFindMany.mockResolvedValue([
      makeDbQuestion({ id: "q-1", ...valid1 }),
      makeDbQuestion({ id: "q-2", ...valid1 }),
      makeDbQuestion({ id: "q-3", ...valid1 }),
      ...Array.from({ length: 13 }, (_, i) => makeDbQuestion({ id: `q-${i + 4}` })),
    ]);

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    expect(res.status).toBe(200);
    expect(mockCreate_llm).not.toHaveBeenCalled();
  });

  test("triggers background refill when cache is low (< REFILL_THRESHOLD)", async () => {
    // validQuestions.length = 4 >= count(3), but still < REFILL_THRESHOLD(15)
    mockFindMany.mockResolvedValue([
      makeDbQuestion({ id: "q-1", type: "multiple_choice", options: '["A","B","C","D"]' }),
      makeDbQuestion({ id: "q-2", type: "multiple_choice", options: '["A","B","C","D"]' }),
      makeDbQuestion({ id: "q-3", type: "multiple_choice", options: '["A","B","C","D"]' }),
      makeDbQuestion({ id: "q-4", type: "multiple_choice", options: '["A","B","C","D"]' }),
    ]);

    // Background refill fails -> covers logger.warn inside `.catch(...)`.
    mockCreate_llm.mockRejectedValueOnce(new Error("Background LLM down"));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    expect(res.status).toBe(200);

    // Let the background promise run.
    await new Promise((r) => setTimeout(r, 10));
    expect(mockCreate_llm).toHaveBeenCalled();
  });
});

// ─── Generation path ──────────────────────────────────────────────────────────

describe("generation path", () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([]); // no cache
  });

  test("returns 503 before calling the LLM when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));

    expect(res.status).toBe(503);
    expect(mockCreate_llm).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toBe("question_generation_not_configured");
  });

  test("calls the LLM when cache is insufficient", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    // Background warmup may also call LLM, so just verify at least once
    expect(mockCreate_llm).toHaveBeenCalled();
  });

  test("saves generated questions to DB via prisma.question.create", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([
      makeLLMQuestion({ type: "multiple_choice" }),
      makeLLMQuestion({ type: "true_false", options: ["True", "False"], answer: "True" }),
    ]));

    await POST(makeRequest({ subItemId: "sub-1", count: 2 }));
    // Background warmup may also save questions, so verify at least the main 2
    expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // ── Bug regression: timeLimit field was unknown in Prisma client ───────────
  test("passes timeLimit to prisma.question.create", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([
      makeLLMQuestion({ timeLimit: 30 }),
    ]));

    await POST(makeRequest({ subItemId: "sub-1", count: 1 }));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data).toHaveProperty("timeLimit");
  });

  test("teaches the LLM the current learning stage for beginner questions", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([
      makeLLMQuestion({ primer: "Look for the signal word first." }),
    ]));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1, difficulty: 1 }));

    expect(res.status).toBe(200);
    const firstPrompt = mockCreate_llm.mock.calls[0][0].messages[0].content;
    expect(firstPrompt).toContain("Current learning stage: Recognize");
    expect(firstPrompt).toContain("Difficulty 1-2 must feel welcoming and low-friction");
  });

  test("saves timeLimit as null when not provided by LLM", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([
      makeLLMQuestion({ timeLimit: null }),
    ]));

    await POST(makeRequest({ subItemId: "sub-1", count: 1 }));

    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.timeLimit).toBeNull();
  });

  test("serializes options array to JSON string before saving", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    await POST(makeRequest({ subItemId: "sub-1", count: 1 }));

    const callArg = mockCreate.mock.calls[0][0];
    expect(typeof callArg.data.options).toBe("string");
    expect(() => JSON.parse(callArg.data.options)).not.toThrow();
  });

  test("returns options as parsed array (not JSON string) to client", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    mockCreate.mockResolvedValue({
      ...makeLLMQuestion(),
      id: "new-q",
      subItemId: "sub-1",
      options: '["Email fraud","Malware","Firewall","VPN"]',
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    const { questions } = await res.json();
    expect(Array.isArray(questions[0].options)).toBe(true);
  });

  test("returns 500 when prisma.question.create throws (e.g. schema mismatch)", async () => {
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    mockCreate.mockRejectedValue(new Error("Unknown argument `timeLimit`"));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("returns 500 when LLM response is not valid JSON", async () => {
    mockCreate_llm.mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }],
    });

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(500);
  });

  // ── Bug regression: response truncated at max_tokens produces invalid JSON ───
  // The wild failure: max_tokens=3000 with adaptive thinking + REFILL_BATCH=5
  // questions cut the payload mid-array and JSON.parse threw. Root cause fixed
  // by raising GENERATION_MAX_TOKENS to 8000. This test pins current behavior:
  // a truncated batch surfaces as 500 (the retry loop around requestQuestionBatch
  // does not catch parseJsonPayload exceptions — a batch-level try/catch with
  // retry on parse failure would add resilience but is out of scope here).
  test("returns 500 when an LLM batch returns JSON truncated at max_tokens", async () => {
    const truncated =
      '{"questions":[{"type":"multiple_choice","content":"Q1","options":["A","B","C","D"],"answer":"A","explanation":"e",';
    mockCreate_llm.mockResolvedValue({
      content: [{ type: "text", text: truncated }],
      usage: { input_tokens: 10, output_tokens: 20 },
      stop_reason: "max_tokens",
    });

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(500);
  });

  // ── Bug regression: LLM wraps JSON in ```json ... ``` markdown fence ────────
  test("parses LLM response wrapped in markdown code fence", async () => {
    const fenced = "```json\n" + JSON.stringify({ questions: [makeLLMQuestion()] }) + "\n```";
    mockCreate_llm.mockResolvedValue({
      content: [{ type: "text", text: fenced }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(200);
  });

  test("handles invalid teachingProfile JSON (still generates questions)", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockSubItem,
      item: {
        ...mockSubItem.item,
        topic: {
          ...mockSubItem.item.topic,
          teachingProfile: "{ invalid json ",
        },
      },
    });

    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(200);
  });

  test("uses valid teachingProfile JSON when present", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockSubItem,
      item: {
        ...mockSubItem.item,
        topic: {
          ...mockSubItem.item.topic,
          teachingProfile: JSON.stringify({
            style: "scenario_based",
            register: "technical_professional",
            questionPatterns: ["What happens when..."],
            contextHint: "Focus on practical scenarios",
            exampleDomain: "Azure portal",
            assessmentFocus: "application",
          }),
        },
      },
    });

    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(200);
  });

  test("grounds generation prompt in uploaded book source pages", async () => {
    mockFindUnique.mockResolvedValue({
      ...mockSubItem,
      sourceStartPage: 19,
      sourceEndPage: 21,
      item: {
        ...mockSubItem.item,
        sourceStartPage: 19,
        sourceEndPage: 35,
        topic: {
          ...mockSubItem.item.topic,
          sourceBook: { id: "book-1", title: "Introducing Power BI", userId: "user-1" },
        },
      },
    });
    mockBookPageFindMany.mockResolvedValue([
      { pageNumber: 19, text: "Power BI is a suite of business analytics tools." },
      { pageNumber: 20, text: "Power BI Desktop can connect to multiple data sources." },
    ]);

    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));

    expect(res.status).toBe(200);
    const firstPrompt = mockCreate_llm.mock.calls[0][0].messages[0].content;
    expect(firstPrompt).toContain("SOURCE MATERIAL FROM THE USER'S UPLOADED BOOK");
    expect(firstPrompt).toContain("Book: \"Introducing Power BI\"");
    expect(firstPrompt).toContain("[Page 19]");
    expect(firstPrompt).toContain("Do not introduce outside facts");
    expect(mockBookPageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bookId: "book-1",
          pageNumber: { gte: 19, lte: 21 },
        },
      }),
    );
  });

  test("returns 500 when Claude returns non-text content", async () => {
    mockCreate_llm.mockResolvedValue({
      content: [{ type: "tool_use", id: "x" }],
    });

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(500);
  });

  test("logs post-generation background warmup failure after successful generation", async () => {
    // First call: awaited generation for `count`
    mockCreate_llm.mockResolvedValueOnce(makeLLMResponse([makeLLMQuestion()]));
    // Second call: background warmup fails
    mockCreate_llm.mockRejectedValueOnce(new Error("Warmup LLM down"));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(200);

    // Let the background promise run so the `.catch(...)` branch can execute.
    await new Promise((r) => setTimeout(r, 10));
    expect(mockCreate_llm.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Prefetch warmup ──────────────────────────────────────────────────────────

describe("prefetch warmup", () => {
  test("returns 202 without charging rate limit when cache is already full", async () => {
    // 16 cached >= PREFETCH_CACHE_TARGET (15) → no LLM call, no quota charge
    mockFindMany.mockResolvedValue(
      Array.from({ length: 16 }, (_, i) => makeDbQuestion({ id: `q-${i + 1}` }))
    );

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 5, prefetch: true }));

    expect(res.status).toBe(202);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockCreate_llm).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.prefetched).toBe(true);
  });

  test("fires background generation when cache is below target, without charging quota", async () => {
    mockFindMany.mockResolvedValue([]); // empty cache
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 5, prefetch: true }));

    expect(res.status).toBe(202);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 10));
    expect(mockCreate_llm).toHaveBeenCalled();
  });

  test("non-prefetch request still charges rate limit", async () => {
    mockFindMany.mockResolvedValue(
      Array.from({ length: 16 }, (_, i) => makeDbQuestion({ id: `q-${i + 1}` }))
    );

    await POST(makeRequest({ subItemId: "sub-1", count: 3 }));

    expect(mockCheckRateLimit).toHaveBeenCalledWith("user-1", 3, "question");
  });
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe("auth guard", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(
      new (await import("next/server")).NextResponse(null, { status: 401 })
    );
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(401);
  });

  test("does not call LLM when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(
      new (await import("next/server")).NextResponse(null, { status: 401 })
    );
    await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(mockCreate_llm).not.toHaveBeenCalled();
  });
});

// ─── Rate limit system ─────────────────────────────────────────────────────────

describe("rate limit system", () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([]); // no cache — forces LLM path
    mockCreate_llm.mockResolvedValue(makeLLMResponse([makeLLMQuestion()]));
  });

  test("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockRejectedValue(
      new MockRateLimitError("hourly", 0, new Date("2026-01-01T00:00:00.000Z")),
    );
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.window).toBe("hourly");
    expect(body.remaining).toBe(0);
    expect(body.upgradeUrl).toBe("/pricing");
  });

  test("includes remaining and resetsAt in 429 response body", async () => {
    mockCheckRateLimit.mockRejectedValue(
      new MockRateLimitError("weekly", 3, new Date("2026-01-08T00:00:00.000Z")),
    );
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    const body = await res.json();
    expect(body.window).toBe("weekly");
    expect(body.remaining).toBe(3);
    expect(typeof body.resetsAt).toBe("string");
  });

  test("calls checkRateLimit with userId/count on success", async () => {
    await POST(makeRequest({ subItemId: "sub-1", count: 4 }));
    expect(mockCheckRateLimit).toHaveBeenCalledWith("user-1", 4, "question");
  });

  test("does not call LLM when rate limit check fails", async () => {
    mockCheckRateLimit.mockRejectedValue(
      new MockRateLimitError("hourly", 0, new Date("2026-01-01T00:00:00.000Z")),
    );
    await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(mockCreate_llm).not.toHaveBeenCalled();
  });

  test("returns 500 when rate limit check throws unexpected error", async () => {
    mockCheckRateLimit.mockRejectedValue(new Error("DB connection lost"));
    const res = await POST(makeRequest({ subItemId: "sub-1", count: 1 }));
    expect(res.status).toBe(500);
  });
});
