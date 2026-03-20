import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Anthropic mock ───────────────────────────────────────────────────────────
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/hint/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockLLMResponse(text: string) {
  mockCreate.mockResolvedValue({ content: [{ type: "text", text }] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/hint", () => {
  test("returns 400 when questionContent is missing", async () => {
    const req = makeRequest({ options: ["A", "B"], answer: "A" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/questionContent/i);
  });

  test("returns a hint from the LLM", async () => {
    mockLLMResponse("  Think about what 'confidentiality' means.  ");
    const req = makeRequest({
      questionContent: "Which pillar of CIA Triad ensures data is private?",
      options: ["Confidentiality", "Integrity", "Availability"],
      answer: "Confidentiality",
      subItemName: "CIA Triad",
      topicName: "Cyber Security",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hint).toBe("Think about what 'confidentiality' means.");
  });

  test("trims whitespace from hint", async () => {
    mockLLMResponse("  \n  Consider the definition.  \n  ");
    const req = makeRequest({
      questionContent: "What is phishing?",
      answer: "Email fraud",
      subItemName: "Threats",
      topicName: "Security",
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.hint).toBe("Consider the definition.");
  });

  test("returns 500 when LLM throws", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));
    const req = makeRequest({
      questionContent: "What is XSS?",
      answer: "Cross-site scripting",
      subItemName: "Web",
      topicName: "Security",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  test("returns 500 when LLM returns non-text content", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "tool_use", id: "x" }] });
    const req = makeRequest({
      questionContent: "What is SQL injection?",
      answer: "Database attack",
      subItemName: "DB",
      topicName: "Security",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  test("works without options field", async () => {
    mockLLMResponse("Think about the network layer.");
    const req = makeRequest({
      questionContent: "What is a firewall?",
      answer: "A network filter",
      subItemName: "Network",
      topicName: "Security",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
