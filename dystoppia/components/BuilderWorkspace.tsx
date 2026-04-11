"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRequireUser } from "@/lib/useRequireUser";
import useAppStore from "@/store/useAppStore";
import type {
  ApprovalGateRecord,
  ArchResource,
  AuditLogRecord,
  BuilderEstimate,
  BuilderRequestRecord,
  BuilderStructuredResult,
  CreditLedgerEntry,
  CreditPackage,
  ReportingOverview,
} from "@/types";

interface BalanceResponse {
  balance: number;
}

interface RequestsResponse {
  requests: BuilderRequestRecord[];
}

interface BillingStatusResponse {
  creditBalance: number;
  creditPackages: CreditPackage[];
}

interface LedgerResponse {
  entries: CreditLedgerEntry[];
}

interface ApprovalGatesResponse {
  gates: ApprovalGateRecord[];
}

interface AuditResponse {
  entries: AuditLogRecord[];
}

interface CreateRequestSuccess {
  ok: true;
  request: BuilderRequestRecord;
  estimate: BuilderEstimate;
  result: BuilderStructuredResult;
  balanceAfter: number;
}

interface ErrorResponse {
  error: string;
  estimate?: BuilderEstimate;
  result?: BuilderStructuredResult;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: "#EEEEFF" }}>{title}</h3>
      {children}
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  essential: "#60A5FA",
  recommended: "#818CF8",
  optional: "#9494B8",
};

function ResourceCard({ resource }: { resource: ArchResource }) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ backgroundColor: "rgba(129,140,248,0.12)", color: "#818CF8" }}
          >
            {resource.category}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${TIER_COLORS[resource.tier] ?? "#9494B8"}18`,
              color: TIER_COLORS[resource.tier] ?? "#9494B8",
            }}
          >
            {resource.tier}
          </span>
        </div>
        <span className="text-xs font-mono" style={{ color: "#60A5FA" }}>
          ${resource.estimatedMonthlyCostUsd.min}–${resource.estimatedMonthlyCostUsd.max}/mo
        </span>
      </div>
      <h4 className="text-sm font-semibold mb-1" style={{ color: "#EEEEFF" }}>
        {resource.name}
      </h4>
      <p className="text-xs mb-2 font-mono" style={{ color: "#818CF8" }}>
        {resource.technology}
      </p>
      <p className="text-xs leading-relaxed mb-2" style={{ color: "#9494B8" }}>
        {resource.purpose}
      </p>
      <div className="text-xs" style={{ color: "#6B6B8A" }}>
        <span className="font-semibold" style={{ color: "#9494B8" }}>Scaling:</span> {resource.scalingStrategy}
      </div>
      {resource.notes && (
        <div className="text-xs mt-1" style={{ color: "#6B6B8A" }}>
          <span className="font-semibold" style={{ color: "#9494B8" }}>Notes:</span> {resource.notes}
        </div>
      )}
    </div>
  );
}

function ArchitectureReport({ result }: { result: BuilderStructuredResult }) {
  const arch = result.architecture;
  const isRichArch = arch && typeof arch === "object" && "classification" in arch;

  return (
    <div className="space-y-5">
      {/* Understanding + Scope */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Request understanding">
          <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>{result.requestUnderstanding}</p>
          {result.assumptions.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs font-semibold" style={{ color: "#6B6B8A" }}>Assumptions</div>
              {result.assumptions.map((a, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: "#6B6B8A" }}>• {a}</p>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Recommended scope">
          <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>{result.recommendedScope}</p>
        </SectionCard>
      </section>

      {/* Architecture overview */}
      {isRichArch && (
        <>
          <SectionCard title="Architecture overview">
            <div className="flex items-center gap-3 mb-3">
              <span
                className="text-xs px-3 py-1.5 rounded-full font-semibold"
                style={{ backgroundColor: "rgba(129,140,248,0.15)", color: "#818CF8", border: "1px solid rgba(129,140,248,0.3)" }}
              >
                {arch.classification.replace(/_/g, " ")}
              </span>
              <span className="text-xs font-mono" style={{ color: "#60A5FA" }}>
                ${arch.totalEstimatedMonthlyCostUsd.min}–${arch.totalEstimatedMonthlyCostUsd.max}/mo total
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#9494B8" }}>
              {arch.summary}
            </p>
            {arch.principles.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold mb-1" style={{ color: "#EEEEFF" }}>Principles</div>
                {arch.principles.map((p, i) => (
                  <p key={i} className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>• {p}</p>
                ))}
              </div>
            )}
            {arch.tradeoffs.length > 0 && (
              <div className="mt-4 space-y-1">
                <div className="text-xs font-semibold mb-1" style={{ color: "#FACC15" }}>Tradeoffs</div>
                {arch.tradeoffs.map((t, i) => (
                  <p key={i} className="text-xs leading-relaxed" style={{ color: "#FACC15" }}>• {t}</p>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Resources */}
          {arch.resources.length > 0 && (
            <SectionCard title={`Resources (${arch.resources.length})`}>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {arch.resources.map((r) => (
                  <ResourceCard key={r.id} resource={r} />
                ))}
              </div>
            </SectionCard>
          )}

          {/* Data flows */}
          {arch.dataFlows.length > 0 && (
            <SectionCard title={`Data flows (${arch.dataFlows.length})`}>
              <div className="space-y-2">
                {arch.dataFlows.map((f, i) => (
                  <div key={i} className="rounded-xl p-3 flex flex-col gap-1" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span style={{ color: "#60A5FA" }}>{f.from}</span>
                      <span style={{ color: "#6B6B8A" }}>{f.async ? "~~>" : "→"}</span>
                      <span style={{ color: "#60A5FA" }}>{f.to}</span>
                      <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(129,140,248,0.12)", color: "#818CF8" }}>
                        {f.protocol}
                      </span>
                      {f.async && (
                        <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(250,204,21,0.12)", color: "#FACC15" }}>
                          async
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: "#9494B8" }}>{f.description}</p>
                    <p className="text-xs" style={{ color: "#6B6B8A" }}>Data: {f.dataType}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Environments */}
          {arch.environments.length > 0 && (
            <SectionCard title="Environments">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {arch.environments.map((env, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>{env.name}</span>
                      <span className="text-xs font-mono" style={{ color: "#60A5FA" }}>
                        ${env.estimatedMonthlyCostUsd.min}–${env.estimatedMonthlyCostUsd.max}/mo
                      </span>
                    </div>
                    <p className="text-xs mb-2" style={{ color: "#9494B8" }}>{env.purpose}</p>
                    <div className="flex flex-wrap gap-1">
                      {env.resources.map((rid) => (
                        <span key={rid} className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: "rgba(129,140,248,0.08)", color: "#818CF8" }}>
                          {rid}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Security boundaries */}
          {arch.securityBoundaries.length > 0 && (
            <SectionCard title="Security boundaries">
              <div className="space-y-3">
                {arch.securityBoundaries.map((sb, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                    <div className="text-sm font-semibold mb-1" style={{ color: "#EEEEFF" }}>{sb.name}</div>
                    <p className="text-xs mb-2" style={{ color: "#9494B8" }}>{sb.scope}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs font-semibold mb-1" style={{ color: "#60A5FA" }}>Controls</div>
                        {sb.controls.map((c, ci) => (
                          <p key={ci} className="text-xs" style={{ color: "#9494B8" }}>• {c}</p>
                        ))}
                      </div>
                      <div>
                        <div className="text-xs font-semibold mb-1" style={{ color: "#F97316" }}>Threats addressed</div>
                        {sb.threats.map((t, ti) => (
                          <p key={ti} className="text-xs" style={{ color: "#9494B8" }}>• {t}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Failure modes */}
          {arch.failureModes.length > 0 && (
            <SectionCard title="Failure modes">
              <div className="space-y-2">
                {arch.failureModes.map((fm, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(249,115,22,0.12)", color: "#F97316" }}>
                        {fm.component}
                      </span>
                      <span className="text-xs" style={{ color: "#6B6B8A" }}>
                        RTO: {fm.rto} · RPO: {fm.rpo}
                      </span>
                    </div>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#EEEEFF" }}>{fm.failureScenario}</p>
                    <p className="text-xs mb-1" style={{ color: "#F97316" }}>Impact: {fm.impact}</p>
                    <p className="text-xs" style={{ color: "#9494B8" }}>Mitigation: {fm.mitigationStrategy}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Cost breakdown */}
          {arch.costBreakdown.length > 0 && (
            <SectionCard title="Cost breakdown">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {arch.costBreakdown.map((cb, i) => (
                  <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>{cb.category}</span>
                      <span className="text-xs font-mono" style={{ color: "#60A5FA" }}>
                        ${cb.estimatedMonthlyCostUsd.min}–${cb.estimatedMonthlyCostUsd.max}/mo
                      </span>
                    </div>
                    {cb.items.map((item, ii) => (
                      <p key={ii} className="text-xs" style={{ color: "#9494B8" }}>• {item}</p>
                    ))}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Scaling notes */}
          {arch.scalingNotes && (
            <SectionCard title="Scaling strategy">
              <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>{arch.scalingNotes}</p>
            </SectionCard>
          )}
        </>
      )}

      {/* Development plan */}
      {result.developmentPlan.length > 0 && (
        <SectionCard title="Development plan">
          <div className="space-y-3">
            {result.developmentPlan.map((milestone, i) => (
              <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-semibold"
                    style={{ backgroundColor: "rgba(129,140,248,0.15)", color: "#818CF8" }}
                  >
                    Phase {typeof milestone === "object" && "phase" in milestone ? milestone.phase : i + 1}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>
                    {typeof milestone === "object" && "name" in milestone ? milestone.name : String(milestone)}
                  </span>
                  {typeof milestone === "object" && "estimatedWeeks" in milestone && (
                    <span className="text-xs" style={{ color: "#6B6B8A" }}>
                      ~{milestone.estimatedWeeks} weeks
                    </span>
                  )}
                </div>
                {typeof milestone === "object" && "deliverables" in milestone && (
                  <div className="space-y-1 mb-2">
                    {milestone.deliverables.map((d: string, di: number) => (
                      <p key={di} className="text-xs" style={{ color: "#9494B8" }}>• {d}</p>
                    ))}
                  </div>
                )}
                {typeof milestone === "object" && "dependencies" in milestone && milestone.dependencies.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs" style={{ color: "#6B6B8A" }}>Depends on:</span>
                    {milestone.dependencies.map((dep: string, di: number) => (
                      <span key={di} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(250,204,21,0.12)", color: "#FACC15" }}>
                        {dep}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* DevOps + Business + Competitive */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {result.devopsPlan.length > 0 && (
          <SectionCard title="DevOps plan">
            <div className="space-y-1">
              {result.devopsPlan.map((item, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>• {item}</p>
              ))}
            </div>
          </SectionCard>
        )}
        <SectionCard title="Business and economics">
          <div className="space-y-1">
            {result.businessNotes.map((item, i) => (
              <p key={i} className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>• {item}</p>
            ))}
          </div>
          <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
            <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Platform cost summary</div>
            <div className="text-sm" style={{ color: "#EEEEFF" }}>
              {result.costSummary.estimatedCredits} credits · ${result.costSummary.estimatedCostUsd.toFixed(4)} · {result.costSummary.viabilityStatus}
            </div>
          </div>
        </SectionCard>
      </section>

      {result.competitiveAssessment && (
        <SectionCard title="Competitive assessment">
          <p className="text-sm leading-relaxed" style={{ color: "#9494B8" }}>{result.competitiveAssessment}</p>
        </SectionCard>
      )}

      {result.verification && (
        <SectionCard title="Verification">
          <div className="flex flex-wrap gap-2 mb-3">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{
                backgroundColor:
                  result.verification.status === "passed"
                    ? "rgba(96,165,250,0.12)"
                    : result.verification.status === "failed"
                      ? "rgba(249,115,22,0.12)"
                      : "rgba(250,204,21,0.12)",
                color:
                  result.verification.status === "passed"
                    ? "#60A5FA"
                    : result.verification.status === "failed"
                      ? "#F97316"
                      : "#FACC15",
              }}
            >
              {result.verification.status.replace(/_/g, " ")}
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-mono"
              style={{ backgroundColor: "rgba(129,140,248,0.12)", color: "#818CF8" }}
            >
              confidence: {result.verification.confidence}
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded-full font-mono"
              style={{ backgroundColor: "#0D0D15", color: "#9494B8", border: "1px solid #2E2E40" }}
            >
              {result.verification.metrics.flaggedChecks}/{result.verification.metrics.totalChecks} findings
            </span>
          </div>
          {result.verification.findings.length > 0 ? (
            <div className="space-y-2">
              {result.verification.findings.map((finding, i) => (
                <div key={`${finding.code}-${i}`} className="rounded-xl p-3" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-mono"
                      style={{
                        backgroundColor:
                          finding.severity === "critical"
                            ? "rgba(249,115,22,0.12)"
                            : finding.severity === "warning"
                              ? "rgba(250,204,21,0.12)"
                              : "rgba(96,165,250,0.12)",
                        color:
                          finding.severity === "critical"
                            ? "#F97316"
                            : finding.severity === "warning"
                              ? "#FACC15"
                              : "#60A5FA",
                      }}
                    >
                      {finding.severity}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: "#818CF8" }}>
                      {finding.source}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>{finding.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: "#60A5FA" }}>
              No red flags were found by the current verification checks.
            </p>
          )}
        </SectionCard>
      )}

      {/* Warnings + Next steps */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {result.warnings.length > 0 && (
          <SectionCard title="Warnings">
            <div className="space-y-1">
              {result.warnings.map((item, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: "#FACC15" }}>• {item}</p>
              ))}
            </div>
          </SectionCard>
        )}
        {result.nextSteps.length > 0 && (
          <SectionCard title="Next steps">
            <div className="space-y-1">
              {result.nextSteps.map((item, i) => (
                <p key={i} className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>• {item}</p>
              ))}
            </div>
          </SectionCard>
        )}
      </section>
    </div>
  );
}

export default function BuilderWorkspace() {
  const { loading } = useRequireUser();
  const userRole = useAppStore((s) => s.userRole);
  const [prompt, setPrompt] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CreditLedgerEntry[]>([]);
  const [history, setHistory] = useState<BuilderRequestRecord[]>([]);
  const [approvalGates, setApprovalGates] = useState<ApprovalGateRecord[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditLogRecord[]>([]);
  const [reportingOverview, setReportingOverview] = useState<ReportingOverview | null>(null);
  const [estimate, setEstimate] = useState<BuilderEstimate | null>(null);
  const [result, setResult] = useState<BuilderStructuredResult | null>(null);
  const [activeRequest, setActiveRequest] = useState<BuilderRequestRecord | null>(null);
  const [error, setError] = useState<string>("");
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (loading || userRole !== "master") return;
    void refreshWorkspace();
  }, [loading, userRole]);

  async function refreshWorkspace() {
    const [balanceRes, requestsRes, billingRes, ledgerRes, approvalsRes, auditRes, reportingRes] = await Promise.all([
      fetch("/api/credits/balance"),
      fetch("/api/builder/requests"),
      fetch("/api/billing/status"),
      fetch("/api/credits/ledger?limit=8"),
      fetch("/api/admin/approval-gates?limit=6"),
      fetch("/api/admin/audit?limit=8"),
      fetch("/api/admin/reporting/overview"),
    ]);

    if (balanceRes.ok) {
      const balanceData = (await balanceRes.json()) as BalanceResponse;
      setCreditBalance(balanceData.balance);
    }

    if (requestsRes.ok) {
      const requestsData = (await requestsRes.json()) as RequestsResponse;
      setHistory(requestsData.requests ?? []);
    }

    if (billingRes.ok) {
      const billingData = (await billingRes.json()) as BillingStatusResponse;
      if (typeof billingData.creditBalance === "number") setCreditBalance(billingData.creditBalance);
      setCreditPackages(billingData.creditPackages ?? []);
    }

    if (ledgerRes.ok) {
      const ledgerData = (await ledgerRes.json()) as LedgerResponse;
      setLedgerEntries(ledgerData.entries ?? []);
    }

    if (approvalsRes.ok) {
      const approvalsData = (await approvalsRes.json()) as ApprovalGatesResponse;
      setApprovalGates(approvalsData.gates ?? []);
    }

    if (auditRes.ok) {
      const auditData = (await auditRes.json()) as AuditResponse;
      setAuditEntries(auditData.entries ?? []);
    }

    if (reportingRes.ok) {
      const reportingData = (await reportingRes.json()) as ReportingOverview;
      setReportingOverview(reportingData);
    }
  }

  async function handleEstimate() {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length < 10 || isEstimating) return;

    setError("");
    setIsEstimating(true);
    try {
      const res = await fetch("/api/builder/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: normalizedPrompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to estimate request.");
        return;
      }
      setEstimate(data.estimate as BuilderEstimate);
    } catch {
      setError("Failed to estimate request.");
    } finally {
      setIsEstimating(false);
    }
  }

  async function handleSubmit() {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length < 10 || isSubmitting) return;

    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/builder/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: normalizedPrompt }),
      });
      const data = (await res.json()) as CreateRequestSuccess | ErrorResponse;

      if (!res.ok) {
        setError(("error" in data ? data.error : "") || "Failed to process Builder request.");
        if ("estimate" in data && data.estimate) setEstimate(data.estimate);
        if ("result" in data && data.result) setResult(data.result);
        return;
      }

      const successData = data as CreateRequestSuccess;
      setActiveRequest(successData.request);
      setEstimate(successData.estimate);
      setResult(successData.result);
      setCreditBalance(successData.balanceAfter);
      setPrompt("");
      await refreshWorkspace();
    } catch {
      setError("Failed to process Builder request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreditTopUp(packageId: string) {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start checkout.");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Failed to start checkout.");
    }
  }

  async function handleResolveApprovalGate(id: string, decision: "approved" | "rejected") {
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
      await refreshWorkspace();
    } catch {
      setError("Failed to resolve approval gate.");
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
          <h1 className="text-3xl font-bold mb-3" style={{ color: "#EEEEFF" }}>Builder is master-only</h1>
          <p className="text-sm mb-6" style={{ color: "#9494B8" }}>
            This MVP keeps Builder behind the master role while security, cost controls, and approval boundaries are being hardened.
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
                <span className="px-3 py-1.5 rounded-full font-semibold" style={{ backgroundColor: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.3)", color: "#818CF8" }}>
                  Builder
                </span>
                <Link href="/governance" className="px-3 py-1.5 rounded-full" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#FACC15" }}>
                  Governance
                </Link>
                <Link href="/learn" className="px-3 py-1.5 rounded-full" style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  Learning
                </Link>
              </div>
              <h1 className="text-4xl font-bold mb-3" style={{ color: "#EEEEFF" }}>Builder Workspace</h1>
              <p className="text-sm md:text-base" style={{ color: "#9494B8" }}>
                Analysis-first planning engine with DevOps, development, architecture, and economic viability built into the workflow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
              <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Credits</div>
                <div className="text-lg font-bold" style={{ color: "#60A5FA" }}>{creditBalance ?? "—"}</div>
              </div>
              <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}>
                <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Requests</div>
                <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>{history.length}</div>
              </div>
            </div>
          </div>
        </motion.section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-3xl p-6"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
          >
            <div className="mb-4">
              <h2 className="text-lg font-bold mb-2" style={{ color: "#EEEEFF" }}>New Builder request</h2>
              <p className="text-sm" style={{ color: "#9494B8" }}>
                Describe the app, workflow, or system you want Dystoppia to analyze and plan.
              </p>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={7}
              placeholder="I want an app that scans another app, summarizes user sentiment from Reddit, explains the business model, and estimates how hard it would be to compete with it."
              className="w-full px-4 py-4 rounded-2xl text-sm resize-none outline-none"
              style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40", color: "#EEEEFF" }}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleEstimate()}
                disabled={isEstimating || isSubmitting || prompt.trim().length < 10}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: "#1C1C28",
                  border: "1px solid #2E2E40",
                  color: "#9494B8",
                  opacity: isEstimating || isSubmitting || prompt.trim().length < 10 ? 0.5 : 1,
                }}
              >
                {isEstimating ? "Estimating..." : "Estimate"}
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || isEstimating || prompt.trim().length < 10}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  backgroundColor: "#818CF8",
                  color: "white",
                  opacity: isSubmitting || isEstimating || prompt.trim().length < 10 ? 0.5 : 1,
                }}
              >
                {isSubmitting ? "Running..." : "Run Builder"}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 rounded-2xl px-4 py-3 text-sm"
                  style={{ backgroundColor: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {estimate && (
              <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
                <SectionCard title="Complexity">
                  <div className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>{estimate.complexity}</div>
                </SectionCard>
                <SectionCard title="Credits">
                  <div className="text-sm font-semibold" style={{ color: "#60A5FA" }}>{estimate.estimatedCredits}</div>
                </SectionCard>
                <SectionCard title="Estimated cost">
                  <div className="text-sm font-semibold" style={{ color: "#EEEEFF" }}>${estimate.totalCostUsd.toFixed(4)}</div>
                </SectionCard>
                <SectionCard title="Viability">
                  <div className="text-sm font-semibold" style={{ color: estimate.viabilityStatus === "approved" ? "#60A5FA" : estimate.viabilityStatus === "reject" ? "#F97316" : "#FACC15" }}>
                    {estimate.viabilityStatus}
                  </div>
                </SectionCard>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl p-6"
            style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
          >
            <div className="mb-4">
              <h2 className="text-lg font-bold" style={{ color: "#EEEEFF" }}>Recent requests</h2>
              <p className="text-sm" style={{ color: "#9494B8" }}>Your latest Builder history.</p>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto">
              {history.length > 0 ? history.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => {
                    setActiveRequest(request);
                    setEstimate(null);
                    setResult((request.resultJson ? JSON.parse(request.resultJson) : null) as BuilderStructuredResult | null);
                  }}
                  className="w-full text-left rounded-2xl p-4 transition-all"
                  style={{ backgroundColor: activeRequest?.id === request.id ? "rgba(129,140,248,0.12)" : "#0D0D15", border: "1px solid #2E2E40" }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(129,140,248,0.12)", color: "#818CF8" }}>
                      {request.viabilityStatus ?? request.status}
                    </span>
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      {request.estimatedCredits} credits
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#EEEEFF" }}>
                    {request.prompt}
                  </p>
                </button>
              )) : (
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  No Builder requests yet.
                </div>
              )}
            </div>
          </motion.div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard title="Top up credits">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {creditPackages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => void handleCreditTopUp(pkg.id)}
                  className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.01]"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                >
                  <div className="text-xs font-semibold mb-2" style={{ color: "#818CF8" }}>
                    {pkg.name}
                  </div>
                  <div className="text-xl font-bold mb-1" style={{ color: "#EEEEFF" }}>
                    {pkg.credits} credits
                  </div>
                  <div className="text-sm mb-2" style={{ color: "#60A5FA" }}>
                    ${(pkg.unitAmountCents / 100).toFixed(2)}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "#9494B8" }}>
                    {pkg.description}
                  </p>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Recent ledger">
            <div className="space-y-3">
              {ledgerEntries.length > 0 ? ledgerEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span
                      className="text-xs px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: entry.amount > 0 ? "rgba(96,165,250,0.12)" : "rgba(249,115,22,0.12)",
                        color: entry.amount > 0 ? "#60A5FA" : "#F97316",
                      }}
                    >
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount} credits
                    </span>
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      Balance after: {entry.balanceAfter}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "#EEEEFF" }}>{entry.reason}</p>
                </div>
              )) : (
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  No credit activity yet.
                </div>
              )}
            </div>
          </SectionCard>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
          <SectionCard title="Master accountability">
            {reportingOverview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>My purchased credits</div>
                  <div className="text-lg font-bold" style={{ color: "#60A5FA" }}>
                    {reportingOverview.ownAccountability.purchasedCredits}
                  </div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>My consumed credits</div>
                  <div className="text-lg font-bold" style={{ color: "#F97316" }}>
                    {reportingOverview.ownAccountability.deductedCredits}
                  </div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Platform requests</div>
                  <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>
                    {reportingOverview.platformOverview.requestCount}
                  </div>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Pending approvals</div>
                  <div className="text-lg font-bold" style={{ color: "#FACC15" }}>
                    {reportingOverview.platformOverview.pendingApprovalGates}
                  </div>
                </div>
                <div className="rounded-2xl p-4 md:col-span-2" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="text-xs mb-1" style={{ color: "#9494B8" }}>Measured API cost</div>
                  <div className="text-lg font-bold" style={{ color: "#EEEEFF" }}>
                    ${reportingOverview.platformOverview.actualCostUsd.toFixed(4)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: "#9494B8" }}>Loading accountability data...</div>
            )}
          </SectionCard>

          <SectionCard title="Approval queue">
            <div className="space-y-3">
              {approvalGates.length > 0 ? approvalGates.map((gate) => (
                <div key={gate.id} className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(250,204,21,0.12)", color: "#FACC15" }}>
                      {gate.status}
                    </span>
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      {gate.requiredRole} · {gate.gateType}
                    </span>
                  </div>
                  <p className="text-sm mb-2" style={{ color: "#EEEEFF" }}>
                    {gate.request?.prompt ?? gate.reason}
                  </p>
                  <p className="text-xs mb-3" style={{ color: "#9494B8" }}>
                    {gate.reason}
                  </p>
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
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", color: "#9494B8" }}>
                  No approval gates waiting right now.
                </div>
              )}
            </div>
          </SectionCard>
        </section>

        <SectionCard title="Recent audit trail">
          <div className="space-y-3">
            {auditEntries.length > 0 ? auditEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl p-4" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}>
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
              <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40", color: "#9494B8" }}>
                No audit events found yet.
              </div>
            )}
          </div>
        </SectionCard>

        {result && (
          <ArchitectureReport result={result} />
        )}
      </div>
    </main>
  );
}
