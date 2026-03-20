import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockCreate = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subItem: { findUnique: mockFindUnique },
    question: { findMany: mockFindMany, create: mockCreate },
  },
}));

// ─── Anthropic mock ───────────────────────────────────────────────────────────

const mockCreate_llm = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate_llm };
  },
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

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(mockSubItem);
  mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data, id: "new-q", createdAt: new Date() })
  );
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
  test("returns cached questions without calling the LLM", async () => {
    // Provide >= 8 questions so background refill doesn't trigger (REFILL_THRESHOLD = 8)
    mockFindMany.mockResolvedValue([
      makeDbQuestion({ id: "q-1" }),
      makeDbQuestion({ id: "q-2" }),
      makeDbQuestion({ id: "q-3" }),
      makeDbQuestion({ id: "q-4" }),
      makeDbQuestion({ id: "q-5" }),
      makeDbQuestion({ id: "q-6" }),
      makeDbQuestion({ id: "q-7" }),
      makeDbQuestion({ id: "q-8" }),
    ]);

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    expect(res.status).toBe(200);
    expect(mockCreate_llm).not.toHaveBeenCalled();
    const { questions } = await res.json();
    expect(questions).toHaveLength(3);
  });

  test("parses options JSON string into array on cache hit", async () => {
    mockFindMany.mockResolvedValue([
      makeDbQuestion({ id: "q-1", options: '["A","B","C","D"]' }),
      makeDbQuestion({ id: "q-2", options: '["True","False"]' }),
      makeDbQuestion({ id: "q-3", options: '["X","Y"]' }),
      makeDbQuestion({ id: "q-4" }),
      makeDbQuestion({ id: "q-5" }),
      makeDbQuestion({ id: "q-6" }),
      makeDbQuestion({ id: "q-7" }),
      makeDbQuestion({ id: "q-8" }),
    ]);

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
    mockFindMany.mockResolvedValue([
      makeDbQuestion({ id: "q-1", type: "fill_blank", options: '["photosynthesis","respiration","fermentation"]' }),
      makeDbQuestion({ id: "q-2", type: "fill_blank", options: '["TCP","UDP","HTTP"]' }),
      makeDbQuestion({ id: "q-3", type: "fill_blank", options: '["malware","spyware","adware"]' }),
      makeDbQuestion({ id: "q-4" }),
      makeDbQuestion({ id: "q-5" }),
      makeDbQuestion({ id: "q-6" }),
      makeDbQuestion({ id: "q-7" }),
      makeDbQuestion({ id: "q-8" }),
    ]);

    const res = await POST(makeRequest({ subItemId: "sub-1", count: 3 }));
    expect(res.status).toBe(200);
    expect(mockCreate_llm).not.toHaveBeenCalled();
  });
});

// ─── Generation path ──────────────────────────────────────────────────────────

describe("generation path", () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([]); // no cache
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
});
