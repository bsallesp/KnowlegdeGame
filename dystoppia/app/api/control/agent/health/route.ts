import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.VM_AGENT_URL ?? "http://host.docker.internal:3333";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "master");
  if (auth instanceof NextResponse) return auth;

  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, agent: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
