import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

const AGENT_URL = process.env.VM_AGENT_URL ?? "http://host.docker.internal:3333";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "";

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "master");
  if (auth instanceof NextResponse) return auth;

  if (!AGENT_TOKEN) {
    return NextResponse.json({ error: "AGENT_TOKEN not configured" }, { status: 503 });
  }

  let body: { message?: string; thread_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, thread_id } = body;
  if (!message || typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${AGENT_URL}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_TOKEN}`,
      },
      body: JSON.stringify({ message: message.trim(), thread_id }),
      signal: AbortSignal.timeout(620_000), // 10 min + buffer
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data.error ?? "Agent error" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, result: data.result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
