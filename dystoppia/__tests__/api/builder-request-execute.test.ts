import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRole = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockLogAuditEvent = vi.hoisted(() => vi.fn());
const mockUsageCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/authorization", () => ({
  requireRole: mockRequireRole,
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    executionRequest: {
      findFirst: mockFindFirst,
    },
    usageEvent: {
      create: mockUsageCreate,
    },
  },
}));

import { POST } from "@/app/api/builder/requests/[id]/execute/route";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("POST /api/builder/requests/[id]/execute", () => {
  test("blocks policy-disallowed execution", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindFirst.mockResolvedValue({
      id: "req-1",
      userId: "master-1",
      module: "builder",
      prompt: "Create a VM and provision a database.",
      actionClass: "privileged_execution",
      approvalGates: [],
    });

    const res = await POST(
      new NextRequest("http://localhost/api/builder/requests/req-1/execute", {
        method: "POST",
        body: JSON.stringify({ mode: "dry_run" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "req-1" }) }
    );

    expect(res.status).toBe(403);
  });

  test("returns dry run manifest for allowed research execution", async () => {
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindFirst.mockResolvedValue({
      id: "req-2",
      userId: "master-1",
      module: "builder",
      prompt: "Scan an app and collect Reddit sentiment.",
      actionClass: "analysis_only",
      approvalGates: [],
    });

    const res = await POST(
      new NextRequest("http://localhost/api/builder/requests/req-2/execute", {
        method: "POST",
        body: JSON.stringify({ mode: "dry_run" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "req-2" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("dry_run");
    expect(body.policy).toEqual(
      expect.objectContaining({
        policyStatus: "allowed",
      })
    );
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "execution.dry_run.created",
        targetId: "req-2",
      })
    );
  });

  test("runs live internal research executor when enabled", async () => {
    vi.stubEnv("DYSTOPPIA_ENABLE_RESEARCH_EXECUTOR", "true");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            children: [
              {
                data: {
                  id: "post-1",
                  title: "Great app for planning",
                  subreddit: "SaaS",
                  author: "tester",
                  permalink: "/r/SaaS/post-1",
                  score: 42,
                  num_comments: 8,
                  created_utc: 1700000000,
                  url: "https://reddit.com/r/SaaS/post-1",
                  selftext: "Subscription looks acceptable",
                },
              },
            ],
          },
        }),
    });
    mockRequireRole.mockResolvedValue({
      userId: "master-1",
      role: "master",
      status: "active",
      isInternal: true,
    });
    mockFindFirst.mockResolvedValue({
      id: "req-3",
      userId: "master-1",
      module: "builder",
      prompt: "Scan an app and collect Reddit sentiment.",
      actionClass: "analysis_only",
      approvalGates: [],
    });

    const res = await POST(
      new NextRequest("http://localhost/api/builder/requests/req-3/execute", {
        method: "POST",
        body: JSON.stringify({ mode: "live" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: "req-3" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("live");
    expect(body.executorResponse).toEqual(
      expect.objectContaining({
        source: "reddit_public_search",
        requestId: "req-3",
      })
    );
    expect(mockUsageCreate).toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "execution.live.completed",
        targetId: "req-3",
      })
    );
    vi.unstubAllEnvs();
  });
});
