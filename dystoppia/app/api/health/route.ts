import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Liveness + DB connectivity. Public (no auth) for Azure / probes and smoke tests.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
