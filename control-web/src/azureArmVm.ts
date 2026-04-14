import { config } from "./config";

const API_VERSION = "2024-03-01";

export type VmPower =
  | "running"
  | "deallocated"
  | "stopped"
  | "starting"
  | "stopping"
  | "unknown";

export interface VmStatus {
  name: string;
  location?: string;
  provisioningState?: string;
  power: VmPower;
  rawPowerCode?: string;
}

function vmBaseUrl() {
  const { subscriptionId, vmResourceGroup, vmName } = config;
  return `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${vmResourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}`;
}

function parsePower(code: string | undefined): VmPower {
  if (!code) return "unknown";
  const normalized = code.toLowerCase();
  if (normalized.includes("powerstate/running")) return "running";
  if (normalized.includes("powerstate/deallocated")) return "deallocated";
  if (normalized.includes("powerstate/stopped")) return "stopped";
  if (normalized.includes("powerstate/starting")) return "starting";
  if (normalized.includes("powerstate/stopping")) return "stopping";
  return "unknown";
}

export async function getVmStatus(accessToken: string): Promise<VmStatus> {
  const url = `${vmBaseUrl()}?api-version=${API_VERSION}&$expand=instanceView`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `ARM error: ${res.status}`);
  }

  const statuses = body?.properties?.instanceView?.statuses ?? [];
  const powerStatus =
    statuses.find((s: any) => typeof s?.code === "string" && s.code.startsWith("PowerState/")) ??
    statuses.find((s: any) => typeof s?.code === "string" && s.code.includes("PowerState/"));

  const rawPowerCode = powerStatus?.code as string | undefined;

  return {
    name: body?.name ?? config.vmName,
    location: body?.location,
    provisioningState: body?.properties?.provisioningState,
    power: parsePower(rawPowerCode),
    rawPowerCode,
  };
}

async function postAction(accessToken: string, action: "start" | "deallocate") {
  const url = `${vmBaseUrl()}/${action}?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 202 || res.status === 200 || res.status === 204) {
    return;
  }
  const body = await res.json().catch(() => ({}));
  throw new Error(body?.error?.message ?? `ARM error: ${res.status}`);
}

export async function startVm(accessToken: string) {
  await postAction(accessToken, "start");
}

export async function stopVm(accessToken: string) {
  await postAction(accessToken, "deallocate");
}

