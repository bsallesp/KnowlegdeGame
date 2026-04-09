"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRequireUser } from "@/lib/useRequireUser";
import useAppStore from "@/store/useAppStore";
import type {
  ApprovalGateRecord,
  AuditLogRecord,
  BuilderRequestDetail,
  BuilderRequestRecord,
  CreditLedgerEntry,
  ExecutionPolicyRecord,
  ReportingOverview,
} from "@/types";

interface RequestsResponse {
  requests: BuilderRequestRecord[];
}

interface ApprovalGatesResponse {
  gates: ApprovalGateRecord[];
}

interface AuditResponse {
  entries: AuditLogRecord[];
}

interface LedgerResponse {
  entries: CreditLedgerEntry[];
}

interface PolicyResponse {
  requestId: string;
  policy: ExecutionPolicyRecord;
  approvalSummary: {
    total: number;
    unresolved: number;
  };
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
    >
      <h2 className="text-lg font-bold mb-4" style={{ color: "#EEEEFF" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function GovernanceConsole() {
  const { loading } = useRequireUser();
  const userRole = useAppStore((s) => s.userRole);
  const [overview, setOverview] = useState<ReportingOverview | null>(null);
  const [requests, setRequests] = useState<BuilderRequestRecord[]>([]);
  const [approvalGates, setApprovalGates] = useState<ApprovalGateRecord[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CreditLedgerEntry[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<BuilderRequestDetail | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyResponse | null>(null);
  const [executionResult, setExecutionResult] = useState<{ mode: string; manifest: unknown } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || userRole !== "master") return;
    void refreshGovernance();
  }, [loading, userRole]);

  async function refreshGovernance() {
    const [overviewRes, requestsRes, approvalsRes, auditRes, ledgerRes] = await Promise.all([
      fetch("/api/admin/reporting/overview"),
      fetch("/api/builder/requests"),
      fetch("/api/admin/approval-gates?limit=12"),
      fetch("/api/admin/audit?limit=20"),
      fetch("/api/credits/ledger?limit=20"),
    ]);

    if (overviewRes.ok) {
      setOverview((await overviewRes.json()) as ReportingOverview);
    }
    if (requestsRes.ok) {
      const data = (await requestsRes.json()) as RequestsResponse;
      setRequests(data.requests ?? []);
    }
    if (approvalsRes.ok) {
      const data = (await approvalsRes.json()) as ApprovalGatesResponse;
      setApprovalGates(data.gates ?? []);
    }
    if (auditRes.ok) {
      const data = (await auditRes.json()) as AuditResponse;
      setAuditEntries(data.entries ?? []);
    }
    if (ledgerRes.ok) {
      const data = (await ledgerRes.json()) as LedgerResponse;
      setLedgerEntries(data.entries ?? []);
    }
  }

  async function loadRequestDetail(id: string) {
    setError("");
    setSelectedRequestId(id);
    setExecutionResult(null);
    try {
      const [detailRes, policyRes] = await Promise.all([
        fetch(`/api/builder/requests/${id}`),
        fetch(`/api/builder/requests/${id}/policy`),
      ]);
      const detailData = await detailRes.json();
      const policyData = await policyRes.json();
      if (!detailRes.ok) {
        setError(detailData.error || "Failed to load request detail.");
        return;
      }
      if (!policyRes.ok) {
        setError(policyData.error || "Failed to load request policy.");
        return;
      }
      setSelectedRequest(detailData.request as BuilderRequestDetail);
      setSelectedPolicy(policyData as PolicyResponse);
    } catch {
      setError("Failed to load request detail.");
    }
  }

  async function handleResolveApprovalGate(id: string, decision: "approved" | "rejected") {
    setError("");
    try {
      const res = await fetch(`/api/admin/approval-gates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to resolve approval gate.");
        return;
      }
      await refreshGovernance();
      if (selectedRequestId) {
        await loadRequestDetail(selectedRequestId);
      }
    } catch {
      setError("Failed to resolve approval gate.");
    }
  }

  async function handleDryRunExecution() {
    if (!selectedRequestId) return;
    setError("");
    try {
      const res = await fetch(`/api/builder/requests/${selectedRequestId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "dry_run" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to execute dry run.");
        return;
      }
      await refreshGovernance();
      await loadRequestDetail(selectedRequestId);
      setExecutionResult({
        mode: data.mode,
        manifest: data.manifest,
      });
    } catch {
      setError("Failed to execute dry run.");
    }
  }

  async function handleLiveExecution() {
    if (!selectedRequestId) return;
    setError("");
    try {
      const res = await fetch(`/api/builder/requests/${selectedRequestId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "live" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to execute live research.");
        return;
      }
      await refreshGovernance();
      await loadRequestDetail(selectedRequestId);
      setExecutionResult({
        mode: data.mode,
        manifest: data.executorResponse ?? data.manifest,
      });
    } catch {
      setError("Failed to execute live research.");
    }
  }

  if (loading) return null;

  if (userRole !== "master") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#09090E" }}>
        <div className="w-full max-w-lg rounded-3xl p-8 text-center" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
          <div className="text-xs font-semibold px-3 py-1 rounded-full inline-flex mb-4" style={{ backgroundColor: "rgba(249,115,22,0.12)", color: "#F97316" }}>
            Restricted
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ color: "#EEEEFF" }}>Governance is master-only</h1>
          <p className="text-sm mb-6" style={{ color: "#9494B8" }}>
            Governance and operations remain private in the MVP while we harden execution rules and reporting.
          </p>
          <Link href="/" className="inline-flex px-4 py-2 rounded-xl text-sm font-semibold" style={{ backgroundColor: "#818CF8", color: "white" }}>
            Return to workspace
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8" style={{ backgroundColor: "#09090E" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129, 140, 248, 0.08) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto flex flex-col gap-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-6"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2 text-xs mb-4">
                <Link href="/" className="px-3 py-1.5 rounded-full" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  Workspace
                </Link>
                <Link href="/builder" className="px-3 py-1.5 rounded-full" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  Builder
                </Link>
                <span className="px-3 py-1.5 rounded-full font-semibold" style={{ backgroundColor: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.3)", color: "#818CF8" }}>
                  Governance
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-3" style={{ color: "#EEEEFF" }}>Governance Console</h1>
              <p className="text-sm md:text-base" style={{ color: "#9494B8" }}>
                Review costs, approval gates, ledger activity, and request-level operational evidence before any future executor is allowed to act.
              </p>
            </div>
          </div>
        </motion.section>

        {error && (
          <div
            className="rounded-2xl px-4 py-3 text-sm"
            style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}
          >
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard title="Master accountability">
            {overview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>My balance</div>
                  <div className="text-lg font-bold" style={{ color: "#60A5FA" }}>{overview.ownAccountability.currentCreditBalance}</div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>My purchased credits</div>
                  <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>{overview.ownAccountability.purchasedCredits}</div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>My consumed credits</div>
                  <div className="text-lg font-bold" style={{ color: "#F97316" }}>{overview.ownAccountability.deductedCredits}</div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>My measured API cost</div>
                  <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>${overview.ownAccountability.actualCostUsd.toFixed(4)}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: "#9494B8" }}>Loading accountability data...</div>
            )}
          </SectionCard>

          <SectionCard title="Platform overview">
            {overview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Users</div>
                  <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>{overview.platformOverview.userCount}</div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Requests</div>
                  <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>{overview.platformOverview.requestCount}</div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Purchased credits</div>
                  <div className="text-lg font-bold" style={{ color: "#60A5FA" }}>{overview.platformOverview.purchasedCredits}</div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Pending approvals</div>
                  <div className="text-lg font-bold" style={{ color: "#FACC15" }}>{overview.platformOverview.pendingApprovalGates}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: "#9494B8" }}>Loading platform overview...</div>
            )}
          </SectionCard>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
          <SectionCard title="Approval queue">
            <div className="space-y-3">
              {approvalGates.length > 0 ? approvalGates.map((gate) => (
                <div key={gate.id} className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(250,204,21,0.12)", color: "#FACC15" }}>
                      {gate.status}
                    </span>
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      {gate.requiredRole} · {gate.gateType}
                    </span>
                  </div>
                  <p className="text-sm mb-2" style={{ color: "#EEEEFF" }}>{gate.request?.prompt ?? gate.reason}</p>
                  <p className="text-xs mb-3" style={{ color: "#9494B8" }}>{gate.reason}</p>
                  {!gate.resolvedAt && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleResolveApprovalGate(gate.id, "approved")}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: "#818CF8", color: "white" }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResolveApprovalGate(gate.id, "rejected")}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )) : (
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  No approval gates waiting right now.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Request investigation">
            <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-4">
              <div className="space-y-3 max-h-[560px] overflow-y-auto">
                {requests.length > 0 ? requests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => void loadRequestDetail(request.id)}
                    className="w-full text-left rounded-2xl p-4 transition-all"
                    style={{
                      backgroundColor: selectedRequestId === request.id ? "rgba(129,140,248,0.12)" : "#0D0D15",
                      border: "1px solid #2E2E40",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(129,140,248,0.12)", color: "#818CF8" }}>
                        {request.viabilityStatus ?? request.status}
                      </span>
                      <span className="text-xs" style={{ color: "#9494B8" }}>
                        {request.estimatedCredits} credits
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "#EEEEFF" }}>{request.prompt}</p>
                  </button>
                )) : (
                  <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40", color: "#9494B8" }}>
                    No Builder requests available.
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-4 min-h-[320px]" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                {selectedRequest ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Selected request</div>
                      <p className="text-sm leading-relaxed" style={{ color: "#EEEEFF" }}>{selectedRequest.prompt}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                        <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Final credits</div>
                        <div className="text-sm font-semibold" style={{ color: "#60A5FA" }}>{selectedRequest.finalCredits}</div>
                      </div>
                      <div className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                        <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Final cost</div>
                        <div className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>${selectedRequest.finalCostUsd.toFixed(4)}</div>
                      </div>
                    </div>

                    {selectedPolicy?.policy && (
                      <div>
                        <div className="text-xs mb-2" style={{ color: "#9494B8" }}>Execution policy</div>
                        <div className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                          <p className="text-sm mb-2" style={{ color: "#EEEEFF" }}>
                            {selectedPolicy.policy.policyStatus} · {selectedPolicy.policy.target} · {selectedPolicy.policy.executorType}
                          </p>
                          <div className="space-y-1">
                            {selectedPolicy.policy.reasons.map((reason) => (
                              <p key={reason} className="text-xs" style={{ color: "#9494B8" }}>
                                {reason}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs mb-2" style={{ color: "#9494B8" }}>Usage events</div>
                      <div className="space-y-2">
                        {selectedRequest.usageEvents.length > 0 ? selectedRequest.usageEvents.map((event) => (
                          <div key={event.id} className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                            <p className="text-sm" style={{ color: "#EEEEFF" }}>{event.serviceType} · {event.provider}</p>
                            <p className="text-xs" style={{ color: "#9494B8" }}>
                              {event.quantity} {event.unit} · ${Number(event.actualCostUsd ?? event.estimatedCostUsd).toFixed(4)}
                            </p>
                          </div>
                        )) : (
                          <p className="text-sm" style={{ color: "#9494B8" }}>No usage events recorded.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs mb-2" style={{ color: "#9494B8" }}>Credit ledger</div>
                      <div className="space-y-2">
                        {selectedRequest.creditLedger.length > 0 ? selectedRequest.creditLedger.map((entry) => (
                          <div key={entry.id} className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                            <p className="text-sm" style={{ color: "#EEEEFF" }}>{entry.reason}</p>
                            <p className="text-xs" style={{ color: "#9494B8" }}>
                              {entry.amount > 0 ? `+${entry.amount}` : entry.amount} · balance after {entry.balanceAfter}
                            </p>
                          </div>
                        )) : (
                          <p className="text-sm" style={{ color: "#9494B8" }}>No ledger entries linked to this request.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs mb-2" style={{ color: "#9494B8" }}>Audit evidence</div>
                      <div className="space-y-2">
                        {selectedRequest.auditLogs.length > 0 ? selectedRequest.auditLogs.map((entry) => (
                          <div key={entry.id} className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                            <p className="text-sm" style={{ color: "#EEEEFF" }}>{entry.eventType}</p>
                            <p className="text-xs" style={{ color: "#9494B8" }}>
                              role: {entry.actorRole ?? "system"} · target: {entry.targetType ?? "n/a"}
                            </p>
                          </div>
                        )) : (
                          <p className="text-sm" style={{ color: "#9494B8" }}>No audit entries linked to this request.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDryRunExecution()}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ backgroundColor: "#818CF8", color: "white" }}
                      >
                        Run policy dry run
                      </button>
                      {selectedPolicy?.policy?.policyStatus === "allowed" && selectedPolicy.policy.executorType !== "none" && (
                        <button
                          type="button"
                          onClick={() => void handleLiveExecution()}
                          className="px-3 py-2 rounded-xl text-xs font-semibold"
                          style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#60A5FA" }}
                        >
                          Run live research executor
                        </button>
                      )}
                    </div>

                    {executionResult && (
                      <div className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                        <div className="text-xs mb-2" style={{ color: "#9494B8" }}>Last execution result</div>
                        <p className="text-sm mb-2" style={{ color: "#EEEEFF" }}>
                          mode: {executionResult.mode}
                        </p>
                        <pre className="text-xs whitespace-pre-wrap" style={{ color: "#9494B8" }}>
                          {JSON.stringify(executionResult.manifest, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: "#9494B8" }}>
                    Select a Builder request to inspect its usage events, ledger activity, and audit trail.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard title="Recent audit trail">
            <div className="space-y-3">
              {auditEntries.length > 0 ? auditEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(129,140,248,0.12)", color: "#818CF8" }}>
                      {entry.eventType}
                    </span>
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      {entry.actorRole ?? "system"}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "#9494B8" }}>
                    target: {entry.targetType ?? "n/a"} · request: {entry.requestId ?? "n/a"}
                  </p>
                </div>
              )) : (
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  No audit events found yet.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Recent ledger activity">
            <div className="space-y-3">
              {ledgerEntries.length > 0 ? ledgerEntries.map((entry) => (
                <div key={entry.id} className="rounded-2xl p-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: entry.amount > 0 ? "rgba(96,165,250,0.12)" : "rgba(249,115,22,0.12)", color: entry.amount > 0 ? "#60A5FA" : "#F97316" }}>
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount} credits
                    </span>
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      balance {entry.balanceAfter}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#EEEEFF" }}>{entry.reason}</p>
                </div>
              )) : (
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  No credit activity yet.
                </div>
              )}
            </div>
          </SectionCard>
        </section>
      </div>
    </main>
  );
}
