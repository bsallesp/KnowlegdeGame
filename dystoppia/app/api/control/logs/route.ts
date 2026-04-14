import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.VM_AGENT_URL ?? "http://host.docker.internal:3333";

/**
 * Returns agent health data as a lightweight "log" endpoint.
 * Docker log access would require mounting /var/run/docker.sock — deferred to future.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "master");
  if (auth instanceof NextResponse) return auth;

  const lines: string[] = [];

  // Agent status
  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        uptime?: number;
        conversations?: number;
        timestamp?: string;
      };
      lines.push(`[agent] ok=${String(data.ok)} uptime=${data.uptime?.toFixed(0)}s conversations=${data.conversations} at=${data.timestamp}`);
    } else {
      lines.push(`[agent] unreachable — HTTP ${res.status}`);
    }
  } catch (err) {
    lines.push(`[agent] unreachable — ${err instanceof Error ? err.message : String(err)}`);
  }

  // App self-check
  lines.push(`[app] process uptime=${process.uptime().toFixed(0)}s at=${new Date().toISOString()}`);

  return NextResponse.json({ lines });
}
