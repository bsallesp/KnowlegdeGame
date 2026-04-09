import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const mockUseRequireUser = vi.hoisted(() => vi.fn(() => ({ loading: false })));
const mockStore = vi.hoisted(() =>
  vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      userRole: "master",
    })
  )
);

vi.mock("@/lib/useRequireUser", () => ({
  useRequireUser: () => mockUseRequireUser(),
}));

vi.mock("@/store/useAppStore", () => ({
  default: (selector: (state: Record<string, unknown>) => unknown) => mockStore(selector),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    section: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <section {...props}>{children}</section>,
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
}));

import GovernanceConsole from "@/components/GovernanceConsole";

describe("GovernanceConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DYSTOPPIA_ENABLE_RESEARCH_EXECUTOR", "true");
    mockUseRequireUser.mockReturnValue({ loading: false });
    mockStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({ userRole: "master" })
    );

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (!init && url.includes("/api/admin/reporting/overview")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ownAccountability: {
                currentCreditBalance: 250,
                purchasedCredits: 300,
                deductedCredits: 50,
                requestCount: 2,
                actualCostUsd: 0.7,
                pendingApprovalGates: 1,
              },
              platformOverview: {
                userCount: 1,
                requestCount: 2,
                purchasedCredits: 300,
                deductedCredits: 50,
                actualCostUsd: 0.7,
                pendingApprovalGates: 1,
              },
              recentAuditEvents: [],
            }),
        });
      }

      if (!init && url.includes("/api/builder/requests/req-1/policy")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              requestId: "req-1",
              policy: {
                target: "research_read_only",
                policyStatus: "allowed",
                executorType: "external_research_executor",
                allowedInMvp: true,
                requiresApproval: false,
                requiresEnv: true,
                recommendedExecutionMode: "dry_run",
                reasons: ["Read-only external research can use the first policy-controlled executor."],
              },
              approvalSummary: {
                total: 1,
                unresolved: 1,
              },
            }),
        });
      }

      if (!init && url.includes("/api/builder/requests/req-1")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              request: {
                id: "req-1",
                userId: "u1",
                module: "builder",
                prompt: "Detailed request investigation",
                normalizedIntent: null,
                requestClass: "builder",
                actionClass: "analysis_only",
                status: "completed",
                viabilityStatus: "approved",
                estimatedCostUsd: 0.3,
                estimatedCredits: 20,
                finalCostUsd: 0.3,
                finalCredits: 20,
                resultJson: null,
                warningsJson: null,
                createdAt: "2026-04-08T10:00:00.000Z",
                updatedAt: "2026-04-08T10:05:00.000Z",
                completedAt: "2026-04-08T10:05:00.000Z",
                approvalGates: [{ id: "gate-1", status: "not_available_in_mvp", requestId: "req-1", gateType: "expensive_execution", requiredRole: "master", reason: "Gated", createdAt: "2026-04-08T10:00:00.000Z" }],
                usageEvents: [{ id: "usage-1", provider: "internal", serviceType: "builder_planning", quantity: 1, unit: "request", estimatedCostUsd: 0.3, actualCostUsd: 0.3, createdAt: "2026-04-08T10:01:00.000Z" }],
                auditLogs: [{ id: "audit-1", eventType: "builder.request.completed", createdAt: "2026-04-08T10:05:00.000Z" }],
                creditLedger: [{ id: "ledger-1", eventType: "deduction", amount: -20, balanceAfter: 230, reason: "Builder request charge", createdAt: "2026-04-08T10:05:00.000Z" }],
              },
            }),
        });
      }

      if (!init && url.includes("/api/builder/requests")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              requests: [
                {
                  id: "req-1",
                  userId: "u1",
                  module: "builder",
                  prompt: "Investigate this app build request",
                  normalizedIntent: null,
                  requestClass: "builder",
                  actionClass: "analysis_only",
                  status: "completed",
                  viabilityStatus: "approved",
                  estimatedCostUsd: 0.3,
                  estimatedCredits: 20,
                  finalCostUsd: 0.3,
                  finalCredits: 20,
                  resultJson: null,
                  warningsJson: null,
                  createdAt: "2026-04-08T10:00:00.000Z",
                  updatedAt: "2026-04-08T10:05:00.000Z",
                  completedAt: "2026-04-08T10:05:00.000Z",
                },
              ],
            }),
        });
      }

      if (!init && url.includes("/api/admin/approval-gates")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              gates: [
                {
                  id: "gate-1",
                  requestId: "req-1",
                  gateType: "expensive_execution",
                  status: "not_available_in_mvp",
                  requiredRole: "master",
                  reason: "Execution remains gated in the MVP.",
                  resolvedByUserId: null,
                  resolvedAt: null,
                  createdAt: "2026-04-08T08:00:00.000Z",
                  request: {
                    id: "req-1",
                    prompt: "Investigate this app build request",
                    actionClass: "privileged_execution",
                    status: "completed",
                  },
                },
              ],
            }),
        });
      }

      if (!init && url.includes("/api/admin/audit")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              entries: [
                {
                  id: "audit-1",
                  actorRole: "master",
                  eventType: "builder.request.completed",
                  targetType: "ExecutionRequest",
                  requestId: "req-1",
                  createdAt: "2026-04-08T10:05:00.000Z",
                },
              ],
            }),
        });
      }

      if (!init && url.includes("/api/credits/ledger")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              entries: [
                {
                  id: "ledger-1",
                  eventType: "deduction",
                  amount: -20,
                  balanceAfter: 230,
                  reason: "Builder request charge",
                  createdAt: "2026-04-08T10:05:00.000Z",
                },
              ],
            }),
        });
      }

      if (init?.method === "POST" && url.includes("/api/admin/approval-gates/gate-1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ gate: { id: "gate-1", status: "approved" } }),
        });
      }

      if (init?.method === "POST" && url.includes("/api/builder/requests/req-1/execute")) {
        const mode = init.body && typeof init.body === "string" && init.body.includes("\"live\"") ? "live" : "dry_run";
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              mode,
              manifest: {
                requestId: "req-1",
                executorType: "external_research_executor",
              },
              executorResponse: {
                source: "reddit_public_search",
                requestId: "req-1",
                query: "test reddit",
                fetchedAt: "2026-04-08T12:00:00.000Z",
                redditPosts: [
                  {
                    id: "post-1",
                    title: "Great app for planning",
                  },
                ],
                summary: {
                  positiveSignalCount: 1,
                  negativeSignalCount: 0,
                  neutralSignalCount: 0,
                  businessModelHints: ["Possible subscription or premium upsell model."],
                  competitionNotes: ["Competition probability should be framed as directional and assumption-based, not as a precise fact."],
                },
              },
            }),
        });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as typeof fetch;
  });

  test("shows restricted view for non-master users", () => {
    mockStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({ userRole: "customer" })
    );

    render(<GovernanceConsole />);

    expect(screen.getByText(/Governance is master-only/i)).toBeTruthy();
  });

  test("renders overview and request detail investigation flow", async () => {
    render(<GovernanceConsole />);

    expect(await screen.findByText(/Governance Console/i)).toBeTruthy();
    expect(screen.getByText(/My balance/i)).toBeTruthy();
    expect(screen.getByText(/Execution remains gated in the MVP/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Investigate this app build request/i }));

    await waitFor(() => expect(screen.getByText(/Detailed request investigation/i)).toBeTruthy());
    expect(screen.getByText(/builder_planning · internal/i)).toBeTruthy();
    expect(screen.getAllByText(/Builder request charge/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/allowed · research_read_only · external_research_executor/i)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^Approve$/i })[0]);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/approval-gates/gate-1",
        expect.objectContaining({ method: "POST" })
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /Run policy dry run/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/builder/requests/req-1/execute",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(screen.getByText(/mode: dry_run/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Run live research executor/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/builder/requests/req-1/execute",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(screen.getByText(/source/i)).toBeTruthy();
  });
});
