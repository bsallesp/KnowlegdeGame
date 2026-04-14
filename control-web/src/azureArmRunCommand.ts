import { config } from "./config";

const API_VERSION = "2024-03-01";

function vmBaseUrl() {
  const { subscriptionId, vmResourceGroup, vmName } = config;
  return `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${vmResourceGroup}/providers/Microsoft.Compute/virtualMachines/${vmName}`;
}

export interface RunCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  raw: unknown;
}

function parseStdOutStdErr(message: string) {
  const normalized = message.replaceAll("\r\n", "\n");
  const stdoutMarker = "[stdout]\n";
  const stderrMarker = "\n\n[stderr]\n";

  const stdoutIndex = normalized.indexOf(stdoutMarker);
  const stderrIndex = normalized.indexOf(stderrMarker);

  if (stdoutIndex !== -1 && stderrIndex !== -1 && stderrIndex > stdoutIndex) {
    const stdout = normalized
      .slice(stdoutIndex + stdoutMarker.length, stderrIndex)
      .trim();
    const stderr = normalized.slice(stderrIndex + stderrMarker.length).trim();
    return { stdout, stderr };
  }

  // Fallback: treat everything as stdout.
  return { stdout: normalized.trim(), stderr: "" };
}

function extractMessages(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw.value)) {
    return raw.value
      .map((v: any) => (typeof v?.message === "string" ? v.message : ""))
      .filter(Boolean);
  }
  if (typeof raw.message === "string") return [raw.message];
  return [];
}

export async function runShellScript(
  accessToken: string,
  scriptLines: string[]
): Promise<RunCommandResult> {
  const url = `${vmBaseUrl()}/runCommand?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      commandId: "RunShellScript",
      script: scriptLines,
    }),
  });

  const raw = await res.json().catch(() => ({}));

  if (res.status === 409) {
    const message =
      raw?.error?.message ??
      "Run command already in progress. Try again in a few seconds.";
    return { ok: false, stdout: "", stderr: message, raw };
  }

  if (!res.ok) {
    const message = raw?.error?.message ?? `ARM error: ${res.status}`;
    return { ok: false, stdout: "", stderr: message, raw };
  }

  const messages = extractMessages(raw).join("\n");
  const parsed = parseStdOutStdErr(messages);
  return { ok: true, stdout: parsed.stdout, stderr: parsed.stderr, raw };
}

