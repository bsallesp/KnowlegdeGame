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

import { GET, PATCH } from "@/app/api/user/profile/route";

function makeRequest(method: "GET" | "PATCH", body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/user/profile", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

beforeEach(() => {
  mockRequireUser.mockReset();
  mockProfileFindUnique.mockReset();
  mockProfileUpsert.mockReset();
  mockRequireUser.mockResolvedValue({ userId: "user-1" });
});

// ─── GET — auth ───────────────────────────────────────────────────────────────
describe("GET /api/user/profile — auth", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    );
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  test("does not query prisma when auth fails", async () => {
    mockRequireUser.mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    );
    await GET(makeRequest("GET"));
    expect(mockProfileFindUnique).not.toHaveBeenCalled();
  });
});

// ─── GET — no profile ─────────────────────────────────────────────────────────
describe("GET /api/user/profile — no profile", () => {
  test("returns { profile: null } when no profile exists", async () => {
    mockProfileFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile).toBeNull();
  });

  test("returns 200 status even when no profile exists", async () => {
    mockProfileFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
  });

  test("queries by userId from auth", async () => {
    mockProfileFindUnique.mockResolvedValue(null);
    await GET(makeRequest("GET"));
    expect(mockProfileFindUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  test("ignores query param userId and still uses authenticated user", async () => {
    mockProfileFindUnique.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/user/profile?userId=attacker-user");
    await GET(req);
    expect(mockProfileFindUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});

// ─── GET — with profile ───────────────────────────────────────────────────────
describe("GET /api/user/profile — existing profile", () => {
  const storedProfile = {
    goals: JSON.stringify(["certification", "career"]),
    knowledgeLevels: JSON.stringify({ cloud: "beginner" }),
    timePerSession: "15min",
    preferredLang: "en",
    rawHistory: JSON.stringify([{ topic: "AZ-900", context: "ctx", createdAt: "2025-01-01" }]),
  };

  beforeEach(() => {
    mockProfileFindUnique.mockResolvedValue(storedProfile);
  });

  test("returns parsed goals array", async () => {
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile.goals).toEqual(["certification", "career"]);
  });

  test("returns parsed knowledgeLevels object", async () => {
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile.knowledgeLevels).toEqual({ cloud: "beginner" });
  });

  test("returns timePerSession string", async () => {
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile.timePerSession).toBe("15min");
  });

  test("returns preferredLang", async () => {
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile.preferredLang).toBe("pt");
  });

  test("returns parsed rawHistory array", async () => {
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile.rawHistory).toHaveLength(1);
    expect(body.profile.rawHistory[0].topic).toBe("AZ-900");
  });

  test("returns empty arrays when JSON fields are null", async () => {
    mockProfileFindUnique.mockResolvedValue({
      goals: null,
      knowledgeLevels: null,
      timePerSession: null,
      preferredLang: "en",
      rawHistory: null,
    });
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(body.profile.goals).toEqual([]);
    expect(body.profile.knowledgeLevels).toEqual({});
    expect(body.profile.rawHistory).toEqual([]);
  });
});

// ─── PATCH — auth ─────────────────────────────────────────────────────────────
describe("PATCH /api/user/profile — auth", () => {
  test("returns 401 when not authenticated", async () => {
    mockRequireUser.mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    );
    const res = await PATCH(makeRequest("PATCH", { preferredLang: "en" }));
    expect(res.status).toBe(401);
  });

  test("does not call upsert when auth fails", async () => {
    mockRequireUser.mockResolvedValue(
      NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    );
    await PATCH(makeRequest("PATCH", { preferredLang: "en" }));
    expect(mockProfileUpsert).not.toHaveBeenCalled();
  });
});

// ─── PATCH — upsert ───────────────────────────────────────────────────────────
describe("PATCH /api/user/profile — upsert", () => {
  test("returns { ok: true } on success", async () => {
    mockProfileUpsert.mockResolvedValue({});
    const res = await PATCH(makeRequest("PATCH", { preferredLang: "en" }));
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("calls upsert with correct userId", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { preferredLang: "en" }));
    expect(mockProfileUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  test("ignores userId sent in payload and keeps authenticated user scope", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { userId: "attacker-user", preferredLang: "en" }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.where.userId).toBe("user-1");
    expect(call.create.userId).toBe("user-1");
  });

  test("serializes goals array to JSON string", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { goals: ["certification", "work"] }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.update.goals).toBe(JSON.stringify(["certification", "work"]));
  });

  test("serializes knowledgeLevels to JSON string", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { knowledgeLevels: { cloud: "intermediate" } }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.update.knowledgeLevels).toBe(JSON.stringify({ cloud: "intermediate" }));
  });

  test("stores timePerSession as plain string", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { timePerSession: "30min" }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.update.timePerSession).toBe("30min");
  });

  test("stores preferredLang as plain string", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { preferredLang: "en" }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.update.preferredLang).toBe("en");
  });

  test("only includes fields that are present in the request", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { preferredLang: "en" }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.update.goals).toBeUndefined();
    expect(call.update.knowledgeLevels).toBeUndefined();
    expect(call.update.timePerSession).toBeUndefined();
    expect(call.update.preferredLang).toBe("en");
  });

  test("create and update payloads match", async () => {
    mockProfileUpsert.mockResolvedValue({});
    await PATCH(makeRequest("PATCH", { preferredLang: "en", timePerSession: "15min" }));
    const call = mockProfileUpsert.mock.calls[0][0];
    expect(call.create.preferredLang).toBe(call.update.preferredLang);
    expect(call.create.timePerSession).toBe(call.update.timePerSession);
  });
});
