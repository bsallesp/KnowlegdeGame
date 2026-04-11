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
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import BuilderWorkspace from "@/components/BuilderWorkspace";

describe("BuilderWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRequireUser.mockReturnValue({ loading: false });
    mockStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        userRole: "master",
      })
    );

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (!init && url.includes("/api/credits/balance")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ balance: 250 }),
        });
      }

      if (!init && url.includes("/api/billing/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              creditBalance: 250,
              creditPackages: [
                {
                  id: "builder_300",
                  name: "Builder 300",
                  credits: 300,
                  unitAmountCents: 3900,
                  description: "Balanced package for repeated planning work.",
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
                  id: "led-1",
                  eventType: "top_up",
                  amount: 300,
                  balanceAfter: 300,
                  reason: "Stripe credit purchase (builder_300)",
                  metadataJson: null,
                  createdAt: "2026-04-08T09:00:00.000Z",
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
                    prompt: "Create a production execution workflow",
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
                  actorUserId: "u1",
                  actorRole: "master",
                  eventType: "builder.request.completed",
                  targetType: "ExecutionRequest",
                  targetId: "req-1",
                  requestId: "req-1",
                  metadataJson: null,
                  createdAt: "2026-04-08T10:05:00.000Z",
                },
              ],
            }),
        });
      }

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
              recentAuditEvents: [
                {
                  id: "audit-1",
                  actorUserId: "u1",
                  actorRole: "master",
                  eventType: "builder.request.completed",
                  targetType: "ExecutionRequest",
                  targetId: "req-1",
                  requestId: "req-1",
                  metadataJson: null,
                  createdAt: "2026-04-08T10:05:00.000Z",
                },
              ],
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
                  prompt: "Build a competitor intelligence MVP",
                  normalizedIntent: null,
                  requestClass: "app_creation",
                  actionClass: "analysis_only",
                  status: "completed",
                  viabilityStatus: "approved",
                  estimatedCostUsd: 0.5,
                  estimatedCredits: 25,
                  finalCostUsd: 0.5,
                  finalCredits: 25,
                  resultJson: JSON.stringify({
                    requestUnderstanding: "Understand the desired product.",
                    assumptions: ["Assume app-store inputs are provided."],
                    recommendedScope: "Focus on analysis and reporting first.",
                    architecture: ["Web app", "LLM orchestration", "Reporting layer"],
                    developmentPlan: ["Build intake", "Add analyzers"],
                    devopsPlan: ["Deploy app", "Monitor usage"],
                    businessNotes: ["Watch unit economics"],
                    competitiveAssessment: "Low chance against top incumbents.",
                    costSummary: {
                      estimatedCredits: 25,
                      estimatedCostUsd: 0.5,
                      viabilityStatus: "approved",
                      confidence: "medium",
                    },
                    verification: {
                      status: "passed_with_warnings",
                      confidence: "medium",
                      findings: [
                        {
                          code: "cost_benchmark_outlier_low",
                          severity: "warning",
                          source: "rule",
                          message: "Estimated monthly cost looks too low.",
                        },
                      ],
                      metrics: {
                        totalChecks: 12,
                        flaggedChecks: 1,
                        criticalFindings: 0,
                        warningFindings: 1,
                        auditFindings: 0,
                      },
                    },
                    warnings: ["Do not automate privileged actions yet."],
                    nextSteps: ["Validate scope", "Run first iteration"],
                  }),
                  warningsJson: null,
                  createdAt: "2026-04-08T10:00:00.000Z",
                  updatedAt: "2026-04-08T10:05:00.000Z",
                  completedAt: "2026-04-08T10:05:00.000Z",
                },
              ],
            }),
        });
      }

      if (init?.method === "POST" && url.includes("/api/builder/estimate")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              estimate: {
                complexity: "medium",
                actionClass: "analysis_only",
                estimatedInputTokens: 1000,
                estimatedOutputTokens: 1200,
                providerCostUsd: 0.12,
                overheadUsd: 0.05,
                safetyBufferUsd: 0.03,
                totalCostUsd: 0.2,
                estimatedCredits: 20,
                viabilityStatus: "approved",
                confidence: "high",
                reasons: ["Fits the MVP scope"],
              },
            }),
        });
      }

      if (init?.method === "POST" && url.includes("/api/builder/requests")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              request: {
                id: "req-2",
                userId: "u1",
                module: "builder",
                prompt: "Create a report-driven competitor scanner",
                normalizedIntent: null,
                requestClass: "app_creation",
                actionClass: "analysis_only",
                status: "completed",
                viabilityStatus: "approved",
                estimatedCostUsd: 0.2,
                estimatedCredits: 20,
                finalCostUsd: 0.2,
                finalCredits: 20,
                resultJson: null,
                warningsJson: null,
                createdAt: "2026-04-08T12:00:00.000Z",
                updatedAt: "2026-04-08T12:01:00.000Z",
                completedAt: "2026-04-08T12:01:00.000Z",
              },
              estimate: {
                complexity: "medium",
                actionClass: "analysis_only",
                estimatedInputTokens: 1000,
                estimatedOutputTokens: 1200,
                providerCostUsd: 0.12,
                overheadUsd: 0.05,
                safetyBufferUsd: 0.03,
                totalCostUsd: 0.2,
                estimatedCredits: 20,
                viabilityStatus: "approved",
                confidence: "high",
                reasons: ["Fits the MVP scope"],
              },
              result: {
                requestUnderstanding: "Create a scoped competitor scanner.",
                assumptions: ["Reddit signal available"],
                recommendedScope: "Start with read-only research flows.",
                architecture: ["Input form", "Research layer"],
                developmentPlan: ["Create builder flow", "Render report"],
                devopsPlan: ["Single app deploy", "Basic logs"],
                businessNotes: ["Track API margin carefully"],
                competitiveAssessment: "Extremely low chance vs Google.",
                costSummary: {
                  estimatedCredits: 20,
                  estimatedCostUsd: 0.2,
                  viabilityStatus: "approved",
                  confidence: "high",
                },
                verification: {
                  status: "passed_with_warnings",
                  confidence: "medium",
                  findings: [
                    {
                      code: "audit_missing_component_1",
                      severity: "warning",
                      source: "audit",
                      message: "A durable queue may be missing for burst handling.",
                    },
                  ],
                  metrics: {
                    totalChecks: 14,
                    flaggedChecks: 1,
                    criticalFindings: 0,
                    warningFindings: 1,
                    auditFindings: 1,
                  },
                },
                warnings: ["No auto-provisioning in MVP"],
                nextSteps: ["Approve scope", "Implement report UI"],
              },
              balanceAfter: 230,
            }),
        });
      }

      if (init?.method === "POST" && url.includes("/api/admin/approval-gates/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              gate: {
                id: "gate-1",
                status: "approved",
              },
            }),
        });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as typeof fetch;
  });

  test("shows restricted view for non-master users", () => {
    mockStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        userRole: "customer",
      })
    );

    render(<BuilderWorkspace />);

    expect(screen.getByText(/Builder is master-only/i)).toBeTruthy();
    expect(screen.getByText(/Return to workspace/i)).toBeTruthy();
  });

  test("loads workspace data and can estimate and submit a request", async () => {
    render(<BuilderWorkspace />);

    await waitFor(() => expect(screen.getByText("250")).toBeTruthy());
    expect(screen.getByText(/Build a competitor intelligence MVP/i)).toBeTruthy();
    expect(screen.getByText(/Builder 300/i)).toBeTruthy();
    expect(screen.getByText(/Stripe credit purchase/i)).toBeTruthy();
    expect(screen.getByText(/My purchased credits/i)).toBeTruthy();
    expect(screen.getByText(/Execution remains gated in the MVP/i)).toBeTruthy();
    expect(screen.getByText(/builder.request.completed/i)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/I want an app that scans another app/i), {
      target: { value: "Create a report-driven competitor scanner with Reddit sentiment and business analysis." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Estimate/i }));
    await waitFor(() => expect(screen.getByText(/\$0.2000/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Run Builder/i }));
    await waitFor(() => expect(screen.getByText(/Create a scoped competitor scanner/i)).toBeTruthy());
    expect(screen.getByText(/No auto-provisioning in MVP/i)).toBeTruthy();
    expect(screen.getByText(/confidence: medium/i)).toBeTruthy();
    expect(screen.getByText(/A durable queue may be missing for burst handling./i)).toBeTruthy();
    expect(screen.getByDisplayValue("")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^Approve$/i })[0]);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/approval-gates/gate-1",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
