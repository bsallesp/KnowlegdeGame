import "./styles.css";
import { config } from "./config";
import { getArmAccessToken, getAccount, initAuth, login, logout } from "./msal";
import { getVmStatus, startVm, stopVm, type VmStatus } from "./azureArmVm";

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");

type State = {
  busy: boolean;
  error: string;
  vm: VmStatus | null;
};

const state: State = {
  busy: false,
  error: "",
  vm: null,
};

function setState(patch: Partial<State>) {
  Object.assign(state, patch);
  render();
}

function badgeFor(vm: VmStatus | null) {
  if (!vm) return { label: "unknown", dot: "dot" };
  if (vm.power === "running") return { label: "running", dot: "dot dot-ok" };
  if (vm.power === "deallocated" || vm.power === "stopped")
    return { label: vm.power, dot: "dot dot-warn" };
  if (vm.power === "starting" || vm.power === "stopping")
    return { label: vm.power, dot: "dot dot-warn" };
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

function render() {
  const account = getAccount();
  const { label, dot } = badgeFor(state.vm);
  const canStart = !state.busy && state.vm?.power !== "running";
  const canStop = !state.busy && state.vm?.power === "running";

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
            <button class="btn btn-ghost" id="refresh" ${!account || state.busy ? "disabled" : ""}>Refresh</button>
            <button class="btn btn-primary" id="start" ${!account || !canStart ? "disabled" : ""}>Start</button>
            <button class="btn btn-danger" id="stop" ${!account || !canStop ? "disabled" : ""}>Stop (Deallocate)</button>
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
        <pre>${escapeHtml(JSON.stringify({ account: account?.username ?? null, vm: state.vm }, null, 2))}</pre>
        <div class="muted" style="font-size: 12px; margin-top: 10px">
          Requer RBAC do seu usuário (ex.: Contributor no resource group).
        </div>
      </div>
    </div>
  `;

  const $ = (id: string) => document.getElementById(id) as HTMLButtonElement | null;
  const loginBtn = $("login");
  const logoutBtn = $("logout");
  const refreshBtn = $("refresh");
  const startBtn = $("start");
  const stopBtn = $("stop");

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
    setState({ vm: null, error: "" });
  });
  refreshBtn?.addEventListener("click", () => void refreshVm());
  startBtn?.addEventListener("click", () => void doStart());
  stopBtn?.addEventListener("click", () => void doStop());
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

