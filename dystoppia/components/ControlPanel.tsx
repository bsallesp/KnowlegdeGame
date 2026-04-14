"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRequireUser } from "@/lib/useRequireUser";
import useAppStore from "@/store/useAppStore";

// ── Types ────────────────────────────────────────────────────────

interface VmStatus {
  name: string;
  location: string;
  powerState: string;
  provisioningState: string;
  vmSize: string;
}

interface AgentHealth {
  ok: boolean;
  uptime?: number;
  conversations?: number;
  timestamp?: string;
}

// ── Sub-components ───────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-3xl p-6"
      style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
    >
      <h2 className="text-base font-semibold mb-4" style={{ color: "#EEEEFF" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{
        backgroundColor: ok ? "rgba(52,211,153,0.12)" : "rgba(249,115,22,0.12)",
        color: ok ? "#34D399" : "#F97316",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: ok ? "#34D399" : "#F97316" }}
      />
      {label}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "#818CF8", color: "white" },
    ghost: { backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" },
    danger: { backgroundColor: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", color: "#F97316" },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function ControlPanel() {
  const { loading } = useRequireUser();
  const userRole = useAppStore((s) => s.userRole);

  const [vmStatus, setVmStatus] = useState<VmStatus | null>(null);
  const [vmError, setVmError] = useState("");
  const [vmLoading, setVmLoading] = useState(false);
  const [vmActionLoading, setVmActionLoading] = useState(false);

  const [agentHealth, setAgentHealth] = useState<AgentHealth | null>(null);
  const [agentError, setAgentError] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [command, setCommand] = useState("");
  const [threadId] = useState(() => `ctrl_${Date.now()}`);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandResult, setCommandResult] = useState("");
  const [commandError, setCommandError] = useState("");

  const resultRef = useRef<HTMLDivElement>(null);

  // ── Data fetchers ──────────────────────────────────────────────

  const fetchVmStatus = useCallback(async () => {
    setVmLoading(true);
    setVmError("");
    try {
      const res = await fetch("/api/control/vm/status");
      const data = await res.json();
      if (!res.ok) {
        setVmError(data.error ?? "Failed to get VM status");
        return;
      }
      setVmStatus(data as VmStatus);
    } catch {
      setVmError("Network error fetching VM status");
    } finally {
      setVmLoading(false);
    }
  }, []);

  const fetchAgentHealth = useCallback(async () => {
    setAgentLoading(true);
    setAgentError("");
    try {
      const res = await fetch("/api/control/agent/health");
      const data = await res.json();
      if (!res.ok) {
        setAgentError(data.error ?? "Agent unreachable");
        setAgentHealth({ ok: false });
        return;
      }
      setAgentHealth(data.agent as AgentHealth);
    } catch {
      setAgentError("Network error");
      setAgentHealth({ ok: false });
    } finally {
      setAgentLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/control/logs");
      if (res.ok) {
        const data = (await res.json()) as { lines: string[] };
        setLogLines(data.lines ?? []);
      }
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading || userRole !== "master") return;
    void fetchVmStatus();
    void fetchAgentHealth();
    void fetchLogs();
  }, [loading, userRole, fetchVmStatus, fetchAgentHealth, fetchLogs]);

  // ── VM actions ──────────────────────────────────────────────────

  async function handleVmAction(action: "start" | "stop") {
    setVmActionLoading(true);
    setVmError("");
    try {
      const res = await fetch(`/api/control/vm/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setVmError(data.error ?? `Failed to ${action} VM`);
        return;
      }
      await fetchVmStatus();
    } catch {
      setVmError(`Network error during ${action}`);
    } finally {
      setVmActionLoading(false);
    }
  }

  // ── Command ────────────────────────────────────────────────────

  async function handleSendCommand() {
    if (!command.trim() || commandLoading) return;
    setCommandLoading(true);
    setCommandError("");
    setCommandResult("");
    try {
      const res = await fetch("/api/control/agent/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: command, thread_id: threadId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommandError(data.error ?? "Agent returned an error");
        return;
      }
      setCommandResult(String(data.result ?? ""));
      setCommand("");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setCommandError("Network error sending command");
    } finally {
      setCommandLoading(false);
    }
  }

  // ── Guards ──────────────────────────────────────────────────────

  if (loading) return null;

  if (userRole !== "master") {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: "#09090E" }}
      >
        <div
          className="w-full max-w-lg rounded-3xl p-8 text-center"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
        >
          <div
            className="text-xs font-semibold px-3 py-1 rounded-full inline-flex mb-4"
            style={{ backgroundColor: "rgba(249,115,22,0.12)", color: "#F97316" }}
          >
            Restricted
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ color: "#EEEEFF" }}>
            Control is master-only
          </h1>
          <p className="text-sm mb-6" style={{ color: "#9494B8" }}>
            Infrastructure controls are restricted to internal operators.
          </p>
          <Link
            href="/"
            className="inline-flex px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: "#818CF8", color: "white" }}
          >
            Return to workspace
          </Link>
        </div>
      </main>
    );
  }

  // ── Derived ─────────────────────────────────────────────────────

  const isVmRunning = vmStatus?.powerState === "VM running";
  const isVmDeallocated =
    vmStatus?.powerState === "VM deallocated" || vmStatus?.powerState === "VM stopped";

  return (
    <main className="min-h-screen px-4 py-8" style={{ backgroundColor: "#09090E" }}>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(129,140,248,0.06) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-6"
          style={{ backgroundColor: "#12121A", border: "1px solid #2E2E40" }}
        >
          <div className="flex flex-wrap gap-2 text-xs mb-4">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}
            >
              Workspace
            </Link>
            <Link
              href="/governance"
              className="px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "#1C1C28", border: "1px solid #2E2E40", color: "#9494B8" }}
            >
              Governance
            </Link>
            <span
              className="px-3 py-1.5 rounded-full font-semibold"
              style={{
                backgroundColor: "rgba(129,140,248,0.12)",
                border: "1px solid rgba(129,140,248,0.3)",
                color: "#818CF8",
              }}
            >
              Control
            </span>
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ color: "#EEEEFF" }}>
            Control Panel
          </h1>
          <p className="text-sm" style={{ color: "#9494B8" }}>
            VM state, agent health, logs, and direct command execution.
          </p>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* VM Section */}
          <Card title="Virtual Machine">
            {vmLoading && !vmStatus && (
              <p className="text-sm" style={{ color: "#9494B8" }}>
                Loading VM status…
              </p>
            )}

            {vmError && (
              <p
                className="text-sm mb-3 rounded-xl px-3 py-2"
                style={{ backgroundColor: "rgba(249,115,22,0.1)", color: "#F97316" }}
              >
                {vmError}
              </p>
            )}

            {vmStatus && (
              <div className="space-y-3 mb-4">
                <div
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      {vmStatus.name} · {vmStatus.location}
                    </span>
                    <StatusBadge label={vmStatus.powerState} ok={isVmRunning} />
                  </div>
                  <div className="text-xs" style={{ color: "#9494B8" }}>
                    Size: {vmStatus.vmSize} · {vmStatus.provisioningState}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => void fetchVmStatus()} disabled={vmLoading}>
                Refresh
              </ActionButton>
              {isVmDeallocated && (
                <ActionButton
                  onClick={() => void handleVmAction("start")}
                  disabled={vmActionLoading}
                  variant="primary"
                >
                  {vmActionLoading ? "Starting…" : "Start VM"}
                </ActionButton>
              )}
              {isVmRunning && (
                <ActionButton
                  onClick={() => void handleVmAction("stop")}
                  disabled={vmActionLoading}
                  variant="danger"
                >
                  {vmActionLoading ? "Stopping…" : "Stop VM"}
                </ActionButton>
              )}
            </div>
          </Card>

          {/* Agent Section */}
          <Card title="Claude Agent">
            {agentLoading && !agentHealth && (
              <p className="text-sm" style={{ color: "#9494B8" }}>
                Checking agent…
              </p>
            )}

            {agentError && (
              <p
                className="text-sm mb-3 rounded-xl px-3 py-2"
                style={{ backgroundColor: "rgba(249,115,22,0.1)", color: "#F97316" }}
              >
                {agentError}
              </p>
            )}

            {agentHealth && (
              <div
                className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: "#0D0D15", border: "1px solid #2E2E40" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <StatusBadge label={agentHealth.ok ? "Online" : "Offline"} ok={agentHealth.ok} />
                  {agentHealth.uptime !== undefined && (
                    <span className="text-xs" style={{ color: "#9494B8" }}>
                      uptime {Math.floor(agentHealth.uptime / 60)}m
                    </span>
                  )}
                </div>
                {agentHealth.conversations !== undefined && (
                  <div className="text-xs" style={{ color: "#9494B8" }}>
                    Active threads: {agentHealth.conversations}
                  </div>
                )}
              </div>
            )}

            <ActionButton onClick={() => void fetchAgentHealth()} disabled={agentLoading}>
              Refresh
            </ActionButton>
          </Card>
        </div>

        {/* Logs Section */}
        <Card title="Status &amp; Logs">
          <div
            className="rounded-2xl p-4 font-mono text-xs mb-4 min-h-[80px]"
            style={{
              backgroundColor: "#0D0D15",
              border: "1px solid #2E2E40",
              color: "#9494B8",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {logsLoading && logLines.length === 0
              ? "Loading…"
              : logLines.length > 0
                ? logLines.join("\n")
                : "No log data."}
          </div>
          <ActionButton onClick={() => void fetchLogs()} disabled={logsLoading}>
            Refresh
          </ActionButton>
        </Card>

        {/* Command Section */}
        <Card title="Agent Command">
          <p className="text-xs mb-4" style={{ color: "#9494B8" }}>
            Send a direct instruction to the Claude agent running on the VM. Responses are
            synchronous — the request stays open until Claude finishes (up to 10 min).
          </p>

          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void handleSendCommand();
              }
            }}
            rows={4}
            placeholder="Enter a command… (Ctrl+Enter to send)"
            className="w-full rounded-2xl px-4 py-3 text-sm resize-none mb-3 outline-none"
            style={{
              backgroundColor: "#0D0D15",
              border: "1px solid #2E2E40",
              color: "#EEEEFF",
            }}
          />

          <div className="flex gap-2 mb-4">
            <ActionButton
              onClick={() => void handleSendCommand()}
              disabled={commandLoading || !command.trim()}
              variant="primary"
            >
              {commandLoading ? "Running…" : "Send"}
            </ActionButton>
          </div>

          {commandError && (
            <div
              className="rounded-2xl px-4 py-3 text-sm mb-3"
              style={{
                backgroundColor: "rgba(249,115,22,0.1)",
                border: "1px solid rgba(249,115,22,0.3)",
                color: "#F97316",
              }}
            >
              {commandError}
            </div>
          )}

          {commandResult && (
            <div ref={resultRef}>
              <div className="text-xs mb-2" style={{ color: "#9494B8" }}>
                Result
              </div>
              <div
                className="rounded-2xl p-4 font-mono text-xs whitespace-pre-wrap"
                style={{
                  backgroundColor: "#0D0D15",
                  border: "1px solid #2E2E40",
                  color: "#EEEEFF",
                  maxHeight: "400px",
                  overflowY: "auto",
                  wordBreak: "break-word",
                }}
              >
                {commandResult}
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
