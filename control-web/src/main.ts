import "./styles.css";
import { config } from "./config";
import { getArmAccessToken, getAccount, initAuth, login, logout } from "./msal";
import { getVmStatus, startVm, stopVm, type VmStatus } from "./azureArmVm";
import { runShellScript } from "./azureArmRunCommand";

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");

type State = {
  busy: boolean;
  error: string;
  vm: VmStatus | null;
  agentBusy: boolean;
  agentError: string;
  agentOut: string;
  agentHealth: unknown | null;
};

const state: State = {
  busy: false,
  error: "",
  vm: null,
  agentBusy: false,
  agentError: "",
  agentOut: "",
  agentHealth: null,
};

function setState(patch: Partial<State>) {
  Object.assign(state, patch);
  render();
}

function getThreadId() {
  const key = "dystoppia_control_thread";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = `ctrl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

function toBase64Utf8(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function badgeFor(vm: VmStatus | null) {
  if (!vm) return { label: "unknown", dot: "dot" };
  if (vm.power === "running") return { label: "running", dot: "dot dot-ok" };
  if (vm.power === "deallocated" || vm.power === "stopped") {
    return { label: vm.power, dot: "dot dot-warn" };
  }
  if (vm.power === "starting" || vm.power === "stopping") {
    return { label: vm.power, dot: "dot dot-warn" };
  }
  return { label: "unknown", dot: "dot" };
}

async function refreshVm() {
  setState({ busy: true, error: "" });
  try {
    const token = await getArmAccessToken();
    const vm = await getVmStatus(token);
    setState({ vm });
  } catch (e) {
    setState({ error: (e as Error).message || String(e) });
  } finally {
    setState({ busy: false });
  }
}

async function doStart() {
  setState({ busy: true, error: "" });
  try {
    const token = await getArmAccessToken();
    await startVm(token);
    await refreshVm();
  } catch (e) {
    setState({ error: (e as Error).message || String(e) });
  } finally {
    setState({ busy: false });
  }
}

async function doStop() {
  setState({ busy: true, error: "" });
  try {
    const token = await getArmAccessToken();
    await stopVm(token);
    await refreshVm();
  } catch (e) {
    setState({ error: (e as Error).message || String(e) });
  } finally {
    setState({ busy: false });
  }
}

async function refreshAgentHealth() {
  setState({ agentBusy: true, agentError: "", agentOut: "" });
  try {
    if (state.vm?.power !== "running") {
      throw new Error("VM is not running. Start the VM first.");
    }
    const token = await getArmAccessToken();
    const result = await runShellScript(token, [
      "set -euo pipefail",
      "curl -s http://localhost:3333/health",
    ]);
    if (!result.ok) {
      throw new Error(result.stderr || "Agent health failed");
    }
    let health: unknown = null;
    try {
      health = JSON.parse(result.stdout || "{}");
    } catch {
      health = result.stdout;
    }
    setState({ agentHealth: health, agentOut: result.stdout });
  } catch (e) {
    setState({ agentError: (e as Error).message || String(e) });
  } finally {
    setState({ agentBusy: false });
  }
}

async function sendAgentCommand(message: string) {
  setState({ agentBusy: true, agentError: "", agentOut: "" });
  try {
    if (state.vm?.power !== "running") {
      throw new Error("VM is not running. Start the VM first.");
    }
    if (!message.trim()) return;

    const payload = JSON.stringify({ message, thread_id: getThreadId() });
    const payloadB64 = toBase64Utf8(payload);
    const token = await getArmAccessToken();

    const result = await runShellScript(token, [
      "set -euo pipefail",
      `PAYLOAD_B64='${payloadB64}'`,
      "PAYLOAD=$(printf '%s' \"$PAYLOAD_B64\" | base64 -d)",
      "TOKEN=$(grep '^AGENT_TOKEN=' /home/azureuser/vm-agent/.env | cut -d'=' -f2-)",
      "curl -s -X POST http://localhost:3333/run \\",
      "  -H \"Authorization: Bearer $TOKEN\" \\",
      "  -H \"Content-Type: application/json\" \\",
      "  -d \"$PAYLOAD\"",
    ]);
    if (!result.ok) {
      throw new Error(result.stderr || "Agent command failed");
    }
    setState({ agentOut: result.stdout });
    void refreshAgentHealth();
  } catch (e) {
    setState({ agentError: (e as Error).message || String(e) });
  } finally {
    setState({ agentBusy: false });
  }
}

function render() {
  const account = getAccount();
  const { label, dot } = badgeFor(state.vm);

  const canStart = !state.busy && state.vm?.power !== "running";
  const canStop = !state.busy && state.vm?.power === "running";
  const canAgent = !!account && !state.agentBusy && state.vm?.power === "running";

  app.innerHTML = `
    <div class="container">
      <div class="row" style="margin-bottom: 14px">
        <div>
          <div style="font-size: 20px; font-weight: 900">Control</div>
          <div class="muted" style="font-size: 12px; margin-top: 4px">
            Static app (fora da VM) — ARM via Entra ID
          </div>
        </div>
        <div class="row">
          <span class="pill">
            <span class="${dot}"></span>
            VM: ${label}
          </span>
          ${
            account
              ? `<button class="btn btn-ghost" id="logout">Logout</button>`
              : `<button class="btn btn-primary" id="login">Login</button>`
          }
        </div>
      </div>

      <div class="card" style="margin-bottom: 12px">
        <div class="row">
          <div>
            <div style="font-weight: 900">Target</div>
            <div class="muted" style="font-size: 12px; margin-top: 6px">
              sub: ${config.subscriptionId}<br/>
              rg: ${config.vmResourceGroup}<br/>
              vm: ${config.vmName}
            </div>
          </div>
          <div class="row">
            <button class="btn btn-ghost" id="refresh" ${
              !account || state.busy ? "disabled" : ""
            }>Refresh</button>
            <button class="btn btn-primary" id="start" ${
              !account || !canStart ? "disabled" : ""
            }>Start</button>
            <button class="btn btn-danger" id="stop" ${
              !account || !canStop ? "disabled" : ""
            }>Stop (Deallocate)</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 12px">
        <div class="row" style="margin-bottom: 10px">
          <div>
            <div style="font-weight: 900">Agent (Claude/Codex na VM)</div>
            <div class="muted" style="font-size: 12px; margin-top: 6px">
              Executa via Azure VM Run Command (sem expor AGENT_TOKEN)
            </div>
          </div>
          <div class="row">
            <button class="btn btn-ghost" id="agentHealth" ${
              !canAgent ? "disabled" : ""
            }>Health</button>
          </div>
        </div>

        <div class="row" style="gap: 10px; align-items: flex-start">
          <div style="flex: 1; min-width: 260px">
            <textarea
              id="agentMessage"
              class="input"
              rows="4"
              placeholder="Envie uma tarefa para o agent... (ex: 'responda só: ok')"
            ></textarea>
            <div class="row" style="justify-content: flex-end; margin-top: 10px">
              <button class="btn btn-primary" id="agentSend" ${
                !canAgent ? "disabled" : ""
              }>Send</button>
            </div>
          </div>
          <div style="flex: 1; min-width: 260px">
            ${
              state.agentError
                ? `<div class="muted" style="margin-bottom: 10px; color: #F97316; font-weight: 800">Error: ${escapeHtml(
                    state.agentError
                  )}</div>`
                : ""
            }
            <pre>${escapeHtml(
              JSON.stringify(
                { health: state.agentHealth, output: state.agentOut ? "(see below)" : null },
                null,
                2
              )
            )}</pre>
            ${
              state.agentOut
                ? `<div style="margin-top: 10px"><pre>${escapeHtml(state.agentOut)}</pre></div>`
                : ""
            }
          </div>
        </div>
      </div>

      <div class="card">
        <div style="font-weight: 900; margin-bottom: 10px">Status</div>
        ${
          state.error
            ? `<div class="muted" style="margin-bottom: 10px; color: #F97316; font-weight: 800">Error: ${escapeHtml(
                state.error
              )}</div>`
            : ""
        }
        <pre>${escapeHtml(
          JSON.stringify({ account: account?.username ?? null, vm: state.vm }, null, 2)
        )}</pre>
        <div class="muted" style="font-size: 12px; margin-top: 10px">
          Requer RBAC do seu usuário (ex.: Contributor no resource group).
        </div>
      </div>
    </div>
  `;

  const $btn = (id: string) =>
    document.getElementById(id) as HTMLButtonElement | null;

  const loginBtn = $btn("login");
  const logoutBtn = $btn("logout");
  const refreshBtn = $btn("refresh");
  const startBtn = $btn("start");
  const stopBtn = $btn("stop");
  const agentHealthBtn = $btn("agentHealth");
  const agentSendBtn = $btn("agentSend");

  loginBtn?.addEventListener("click", async () => {
    setState({ error: "" });
    try {
      await login();
      await refreshVm();
    } catch (e) {
      setState({ error: (e as Error).message || String(e) });
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    await logout();
    setState({
      vm: null,
      error: "",
      agentHealth: null,
      agentOut: "",
      agentError: "",
    });
  });

  refreshBtn?.addEventListener("click", () => void refreshVm());
  startBtn?.addEventListener("click", () => void doStart());
  stopBtn?.addEventListener("click", () => void doStop());

  agentHealthBtn?.addEventListener("click", () => void refreshAgentHealth());
  agentSendBtn?.addEventListener("click", () => {
    const input = document.getElementById(
      "agentMessage"
    ) as HTMLTextAreaElement | null;
    void sendAgentCommand(input?.value ?? "");
  });
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function boot() {
  render();
  await initAuth();
  render();
  if (getAccount()) {
    await refreshVm();
  }
}

boot().catch((e) => {
  setState({ error: (e as Error).message || String(e) });
});
