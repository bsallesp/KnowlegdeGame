import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const mockProfileFindUnique = vi.hoisted(() => vi.fn());
const mockProfileUpsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: mockProfileFindUnique,
      upsert: mockProfileUpsert,
    },
  },
}));

// ─── Auth guard mock ──────────────────────────────────────────────────────────
const mockRequireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authGuard", () => ({ requireUser: mockRequireUser }));

// ─── Anthropic mock ───────────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { POST } from "@/app/api/onboarding/chat/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/onboarding/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeAnthropicResponse(jsonContent: object) {
  return {
    content: [{ type: "text", text: JSON.stringify(jsonContent) }],
  };
}

const turnResponse = {
  readyToCreate: false,
  turn: {
    question: "What is your level?",
    subtitle: "Helps calibrate content",
    multiSelect: false,
    cards: [
      { id: "beginner", label: "Beginner", icon: "🌱" },
      { id: "advanced", label: "Advanced", icon: "🚀" },
    ],
    allowFreeText: true,
    freeTextPlaceholder: "Describe your level...",
  },
  summary: { topic: "AZ-900" },
};

const readyResponse = {
  readyToCreate: true,
  turn: null,
  summary: { topic: "AZ-900", level: "Beginner" },
  onboardingContext: "Beginner user seeking AZ-900 certification.",
};

beforeEach(() => {
  mockRequireUser.mockReset();
  mockProfileFindUnique.mockReset();
  mockProfileUpsert.mockReset();
  mockCreate.mockReset();

  mockRequireUser.mockResolvedValue({ userId: "user-1" });
  mockProfileFindUnique.mockResolvedValue(null);
  mockProfileUpsert.mockResolvedValue({});
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — auth", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    expect(res.status).toBe(401);
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — validation", () => {
  test("returns 400 when topic is missing", async () => {
    const res = await POST(makeRequest({ messages: [], pillar: "studio" }));
    expect(res.status).toBe(400);
  });

  test("returns 400 when topic is empty string", async () => {
    const res = await POST(makeRequest({ topic: "", messages: [], pillar: "studio" }));
    expect(res.status).toBe(400);
  });
});

// ─── Normal turn ──────────────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — turn response", () => {
  test("calls Anthropic with Haiku model", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" })
    );
  });

  test("returns turn data when not ready to create", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const body = await res.json();
    expect(body.readyToCreate).toBe(false);
    expect(body.turn).toBeTruthy();
    expect(body.turn.question).toBe("What is your level?");
  });

  test("returns cards in turn", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const body = await res.json();
    expect(body.turn.cards).toHaveLength(2);
    expect(body.turn.cards[0].id).toBe("beginner");
  });

  test("includes summary in response", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const body = await res.json();
    expect(body.summary.topic).toBe("AZ-900");
  });

  test("does not call userProfile.upsert when not ready", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    expect(mockProfileUpsert).not.toHaveBeenCalled();
  });
});

// ─── Ready to create ──────────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — readyToCreate", () => {
  test("returns readyToCreate=true when AI decides it's ready", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(readyResponse));
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const body = await res.json();
    expect(body.readyToCreate).toBe(true);
  });

  test("returns onboardingContext when ready", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(readyResponse));
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const body = await res.json();
    expect(body.onboardingContext).toBe("Beginner user seeking AZ-900 certification.");
  });

  test("saves onboarding entry to userProfile when ready", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(readyResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    expect(mockProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      })
    );
  });

  test("upserted profile contains rawHistory with the new entry", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(readyResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const upsertCall = mockProfileUpsert.mock.calls[0][0];
    const history = JSON.parse(upsertCall.create.rawHistory);
    expect(history).toHaveLength(1);
    expect(history[0].topic).toBe("AZ-900");
    expect(history[0].context).toBe("Beginner user seeking AZ-900 certification.");
  });
});

// ─── Existing profile ─────────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — existing profile", () => {
  test("fetches user profile before building prompt", async () => {
    mockProfileFindUnique.mockResolvedValue({
      goals: JSON.stringify(["certification"]),
      knowledgeLevels: JSON.stringify({}),
      timePerSession: "15min",
      preferredLang: "pt",
      rawHistory: null,
    });
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    expect(mockProfileFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  test("appends to existing rawHistory when saving", async () => {
    const existingHistory = [{ topic: "AWS", context: "old ctx", createdAt: "2025-01-01" }];
    mockProfileFindUnique.mockResolvedValue({ rawHistory: JSON.stringify(existingHistory) });
    mockCreate.mockResolvedValue(makeAnthropicResponse(readyResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const upsertCall = mockProfileUpsert.mock.calls[0][0];
    const history = JSON.parse(upsertCall.update.rawHistory);
    expect(history).toHaveLength(2);
    expect(history[0].topic).toBe("AWS");
    expect(history[1].topic).toBe("AZ-900");
  });

  test("trims rawHistory to last 30 entries", async () => {
    const longHistory = Array.from({ length: 30 }, (_, i) => ({
      topic: `topic-${i}`,
      context: "ctx",
      createdAt: "2025-01-01",
    }));
    mockProfileFindUnique.mockResolvedValue({ rawHistory: JSON.stringify(longHistory) });
    mockCreate.mockResolvedValue(makeAnthropicResponse(readyResponse));
    await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const upsertCall = mockProfileUpsert.mock.calls[0][0];
    const history = JSON.parse(upsertCall.update.rawHistory);
    expect(history).toHaveLength(30);
    expect(history[history.length - 1].topic).toBe("AZ-900");
  });
});

// ─── AI parse failure ─────────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — AI error handling", () => {
  test("returns 500 when AI response cannot be parsed as JSON", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "Not valid JSON" }] });
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    expect(res.status).toBe(500);
  });

  test("handles JSON wrapped in markdown code fences", async () => {
    const wrapped = "```json\n" + JSON.stringify(turnResponse) + "\n```";
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: wrapped }] });
    const res = await POST(makeRequest({ topic: "AZ-900", messages: [], pillar: "studio" }));
    const body = await res.json();
    expect(body.readyToCreate).toBe(false);
  });
});

// ─── Conversation history ─────────────────────────────────────────────────────
describe("POST /api/onboarding/chat — conversation history", () => {
  test("includes message history in prompt sent to AI", async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse(turnResponse));
    const messages = [
      { role: "assistant", content: "What is your level?" },
      { role: "user", content: "Beginner", selectedCards: ["beginner"] },
    ];
    await POST(makeRequest({ topic: "AZ-900", messages, pillar: "studio" }));
    const promptSent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(promptSent).toContain("Beginner");
  });
});

