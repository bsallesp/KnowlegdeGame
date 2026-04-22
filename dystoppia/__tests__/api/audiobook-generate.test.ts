import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Anthropic mock ───────────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: mockCreate }; },
}));

// ─── TTS mock ─────────────────────────────────────────────────────────────────
const mockSynthesize = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tts", () => ({
  getTTSProvider: () => ({ synthesize: mockSynthesize }),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockTopicFindUnique = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    topic: { findUnique: mockTopicFindUnique },
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────
vi.mock("@/lib/authGuard", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── LLM usage logger mock (avoid Prisma writes) ──────────────────────────────
vi.mock("@/lib/llmLogger", () => ({
  logLLMUsage: vi.fn(),
}));

import { POST } from "@/app/api/audiobook/generate/route";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const AUDIO_BUFFER = Buffer.from("fake-audio-data");

const TOPIC = {
  id: "topic-1",
  name: "SOC Analyst",
  items: [
    {
      id: "item-1",
      name: "Security Fundamentals",
      subItems: [
        { id: "sub-1", name: "CIA Triad", itemName: "Security Fundamentals" },
        { id: "sub-2", name: "Attack Vectors", itemName: "Security Fundamentals" },
      ],
    },
    {
      id: "item-2",
      name: "SIEM Operations",
      subItems: [
        { id: "sub-3", name: "Log Analysis", itemName: "SIEM Operations" },
      ],
    },
  ],
};

const STATS = {
  "sub-1": { correctCount: 1, totalCount: 5, difficulty: 1 }, // weak
  "sub-2": { correctCount: 8, totalCount: 10, difficulty: 3 }, // mastered
  // sub-3 has no stats → upcoming
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/audiobook/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockLLM(text = "This is the audio script.") {
  mockCreate.mockResolvedValue({
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  mockUserFindUnique.mockResolvedValue({ plan: "learner" });
  mockTopicFindUnique.mockResolvedValue(TOPIC);
  mockSynthesize.mockResolvedValue(AUDIO_BUFFER);
  mockLLM();
});

// ─── Validation ───────────────────────────────────────────────────────────────
describe("POST /api/audiobook/generate — validation", () => {
  test("returns 400 when topicId is missing", async () => {
    const res = await POST(makeRequest({ subItemStats: {} }));
    expect(res.status).toBe(400);
  });

  test("returns 404 when topic not found", async () => {
    mockTopicFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ topicId: "missing", subItemStats: {} }));
    expect(res.status).toBe(404);
  });

  test("returns 404 when itemId not found in topic", async () => {
    const res = await POST(makeRequest({ topicId: "topic-1", itemId: "bad-item", subItemStats: {} }));
    expect(res.status).toBe(404);
  });

  test("returns 404 when subItemId not found in topic", async () => {
    const res = await POST(makeRequest({ topicId: "topic-1", subItemId: "bad-sub", subItemStats: {} }));
    expect(res.status).toBe(404);
  });
});

// ─── Scope: full topic ────────────────────────────────────────────────────────
describe("POST /api/audiobook/generate — topic scope (no itemId/subItemId)", () => {
  test("returns 200 with audio/mpeg content type", async () => {
    const res = await POST(makeRequest({ topicId: "topic-1", subItemStats: STATS }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  test("calls Claude to generate a script", async () => {
    await POST(makeRequest({ topicId: "topic-1", subItemStats: STATS }));
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  test("calls TTS synthesize with the script", async () => {
    mockLLM("Direct script text.");
    await POST(makeRequest({ topicId: "topic-1", subItemStats: STATS }));
    expect(mockSynthesize).toHaveBeenCalledWith("Direct script text.", expect.any(Object));
  });

  test("prompt includes weak spots", async () => {
    await POST(makeRequest({ topicId: "topic-1", subItemStats: STATS }));
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("CIA Triad");
  });

  test("prompt includes 'Topic' scope label when no itemId/subItemId", async () => {
    await POST(makeRequest({ topicId: "topic-1", subItemStats: STATS }));
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Topic");
  });

  test("returns audio buffer as response body", async () => {
    const res = await POST(makeRequest({ topicId: "topic-1", subItemStats: STATS }));
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe("fake-audio-data");
  });
});

// ─── Scope: item ──────────────────────────────────────────────────────────────
describe("POST /api/audiobook/generate — item scope", () => {
  test("returns 200 for valid itemId", async () => {
    const res = await POST(makeRequest({ topicId: "topic-1", itemId: "item-1", subItemStats: STATS }));
    expect(res.status).toBe(200);
  });

  test("prompt includes 'Chapter' scope label", async () => {
    await POST(makeRequest({ topicId: "topic-1", itemId: "item-1", subItemStats: STATS }));
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Chapter");
    expect(prompt).toContain("Security Fundamentals");
  });

  test("only passes subitems of the requested item to classifier", async () => {
    await POST(makeRequest({ topicId: "topic-1", itemId: "item-2", subItemStats: {} }));
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Log Analysis");
    expect(prompt).not.toContain("CIA Triad");
  });
});

// ─── Scope: subitem ───────────────────────────────────────────────────────────
describe("POST /api/audiobook/generate — subitem scope", () => {
  test("returns 200 for valid subItemId", async () => {
    const res = await POST(makeRequest({ topicId: "topic-1", subItemId: "sub-1", subItemStats: STATS }));
    expect(res.status).toBe(200);
  });

  test("prompt includes 'Concept' scope label", async () => {
    await POST(makeRequest({ topicId: "topic-1", subItemId: "sub-1", subItemStats: STATS }));
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Concept");
    expect(prompt).toContain("CIA Triad");
  });

  test("prompt does not include other subitems", async () => {
    await POST(makeRequest({ topicId: "topic-1", subItemId: "sub-1", subItemStats: STATS }));
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).not.toContain("Log Analysis");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────
describe("POST /api/audiobook/generate — error handling", () => {
  test("returns 500 when Claude returns non-text content", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "tool_use", id: "x" }] });
    const res = await POST(makeRequest({ topicId: "topic-1", subItemStats: {} }));
    expect(res.status).toBe(500);
  });

  test("returns 500 when Claude throws", async () => {
    mockCreate.mockRejectedValue(new Error("Claude API down"));
    const res = await POST(makeRequest({ topicId: "topic-1", subItemStats: {} }));
    expect(res.status).toBe(500);
  });

  test("returns 500 when TTS throws", async () => {
    mockSynthesize.mockRejectedValue(new Error("TTS failed"));
    const res = await POST(makeRequest({ topicId: "topic-1", subItemStats: {} }));
    expect(res.status).toBe(500);
  });

  test("error response includes details field", async () => {
    mockCreate.mockRejectedValue(new Error("Oops"));
    const res = await POST(makeRequest({ topicId: "topic-1", subItemStats: {} }));
    const body = await res.json();
    expect(body.details).toContain("Oops");
  });
});
